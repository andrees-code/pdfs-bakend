import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import * as zlib from 'zlib';
import { put } from '@vercel/blob';

@Injectable()
export class PresentationsService {
  constructor(
    @InjectModel('Presentation') private readonly presentationModel: Model<any>,
  ) { }

  private decompressStateFields(dto: any) {
    if (dto.compressedState) {
      try {
        const decompressed = zlib.gunzipSync(Buffer.from(dto.compressedState, 'base64')).toString('utf8');
        const parsed = JSON.parse(decompressed);

        dto.documentState = parsed.documentState || {};
        dto.slideConfigs = parsed.slideConfigs || {};
        dto.pdfPageMap = parsed.pdfPageMap || {};

        // Mantener compressedState para guardarlo en DB si no se sobrescribe
      } catch (error) {
        console.warn('⚠️ No se pudo descomprimir compressedState:', error.message);
      }
    }
  }

  private compressStateFields(dto: any) {
    try {
      const rawObject = {
        documentState: dto.documentState || {},
        slideConfigs: dto.slideConfigs || {},
        pdfPageMap: dto.pdfPageMap || {},
      };

      const rawJson = JSON.stringify(rawObject);
      if (rawJson.length > 3 * 1024 * 1024) {
        const compressed = zlib.gzipSync(Buffer.from(rawJson, 'utf8')).toString('base64');
        dto.compressedState = compressed;

        // Para no enviar/guardar los campos pesados duplicados
        dto.documentState = {};
        dto.slideConfigs = {};
        dto.pdfPageMap = {};
      }
    } catch (error) {
      console.warn('⚠️ No se pudo comprimir state fields:', error.message);
    }
  }

  // 1. Subir archivo a Vercel Blob
  private async saveBase64ToFile(base64String: string, filePrefix: string, extension: string): Promise<string> {
    if (!base64String || base64String.startsWith('http') || base64String.length < 500) {
      return base64String; // Si ya es URL o está vacío, no hacer nada
    }

    const base64Data = base64String.includes('base64,')
      ? base64String.split('base64,')[1]
      : base64String;

    const fileName = `${filePrefix}_${Date.now()}.${extension}`;
    const buffer = Buffer.from(base64Data, 'base64');

    try {
      console.log(`📤 Subiendo ${fileName} a Vercel Blob...`);
      const { url } = await put(`uploads/${fileName}`, buffer, {
        access: 'public', // Cambiado a public para permitir que el frontend lo lea sin 403
        token: process.env.BLOB_READ_WRITE_TOKEN,
        multipart: true, // 🔥 REQUERIDO: Permite subidas pesadas (como portadas generadas de alta calidad)
      });
      console.log(`✅ ${fileName} subido a Vercel Blob:`, url);
      return url;
    } catch (error: any) {
      console.error(`❌ Error subiendo ${fileName} a Vercel Blob:`, error.message);
      throw error;
    }
  }

  // 2. EL ASPIRADOR PROFUNDO: Busca y extrae todos los Base64 del JSON
  private async extractAndSaveMedia(dto: any) {
    // A. Portada y PDF Principal
    dto.coverImage = await this.saveBase64ToFile(dto.coverImage, 'cover', 'jpg');
    dto.pdfBase64 = await this.saveBase64ToFile(dto.pdfBase64, 'pdf', 'pdf');

    // B. Imágenes de fondo de las diapositivas
    if (dto.slideConfigs) {
      for (const page in dto.slideConfigs) {
        if (dto.slideConfigs[page].bgImage) {
          dto.slideConfigs[page].bgImage = await this.saveBase64ToFile(dto.slideConfigs[page].bgImage, 'bg', 'jpg');
        }
      }
    }

    // C. Elementos dentro del lienzo (imágenes, audios)
    if (dto.documentState) {
      for (const page in dto.documentState) {
        if (Array.isArray(dto.documentState[page])) {
          for (const el of dto.documentState[page]) {
            if (el.src) {
              const ext = el.type === 'audio' ? 'mp3' : 'png';
              el.src = await this.saveBase64ToFile(el.src, `element_${el.type}`, ext);
            }
          }
        }
      }
    }

    return dto;
  }

  async create(createDto: CreatePresentationDto) {
    console.log('🔄 [Service] Extrayendo y guardando archivos base64...');
    try {
      this.decompressStateFields(createDto);

      // Limpiamos los Base64 antes de crear
      const cleanedDto = await this.extractAndSaveMedia(createDto);

      // Para optimizar almacenamiento y respuestas, comprimimos el estado pesado si es grande
      this.compressStateFields(cleanedDto);

      console.log('✅ [Service] Archivos guardados. Guardando en BD...');
      const createdPresentation = new this.presentationModel(cleanedDto);
      const result = await createdPresentation.save();
      console.log('✅ [Service] Presentación guardada en BD con ID:', result._id);
      return result;
    } catch (error) {
      console.error('❌ [Service] Error en create():', error.message);
      throw error;
    }
  }

  async update(id: string, updateDto: any) {
    console.log('🔄 [Service] Extrayendo y guardando archivos base64 para actualización...');
    try {
      this.decompressStateFields(updateDto);

      // Limpiamos los Base64 antes de actualizar
      const cleanedDto = await this.extractAndSaveMedia(updateDto);

      // Para optimizar almacenamiento y respuestas, comprimimos el estado pesado si es grande
      this.compressStateFields(cleanedDto);

      console.log('✅ [Service] Archivos guardados. Actualizando BD...');
      const result = await this.presentationModel.findByIdAndUpdate(id, cleanedDto, { new: true });
      console.log('✅ [Service] Presentación actualizada');
      return result;
    } catch (error) {
      console.error('❌ [Service] Error en update():', error.message);
      throw error;
    }
  }

  async findAll(userId?: string) {
    const query = this.presentationModel.find();
    if (userId) {
      query.where('userId').equals(userId);
    }
    // Seguimos excluyendo pdfBase64 por seguridad
    return await query.select('-pdfBase64').sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string) {
    const presentation = await this.presentationModel.findById(id).lean();
    if (!presentation) return null;

    // Si la presentación tiene estado comprimido, sirve el compressedState
    // y evita enviar campos enormes sin comprimir.
    if (presentation.compressedState) {
      return {
        ...presentation,
        documentState: presentation.documentState || {},
        slideConfigs: presentation.slideConfigs || {},
        pdfPageMap: presentation.pdfPageMap || {},
      };
    }

    // Si no hay compressedState pero los objetos son demasiado grandes,
    // aplicamos compresión para futuras requests.
    try {
      const rawObject = {
        documentState: presentation.documentState || {},
        slideConfigs: presentation.slideConfigs || {},
        pdfPageMap: presentation.pdfPageMap || {},
      };
      const rawJson = JSON.stringify(rawObject);
      if (rawJson.length > 5 * 1024 * 1024) {
        const compressed = zlib.gzipSync(Buffer.from(rawJson, 'utf8')).toString('base64');
        await this.presentationModel.findByIdAndUpdate(id, {
          compressedState: compressed,
          documentState: {},
          slideConfigs: {},
          pdfPageMap: {},
        });

        return {
          ...presentation,
          documentState: {},
          slideConfigs: {},
          pdfPageMap: {},
          compressedState: compressed,
        };
      }
    } catch (error) {
      console.warn('⚠️ No se pudo recomprimir en findOne:', error.message);
    }

    return presentation;
  }

  async remove(id: string) {
    return await this.presentationModel.findByIdAndDelete(id);
  }
}