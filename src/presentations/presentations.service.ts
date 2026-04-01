import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, mongo } from 'mongoose';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import * as zlib from 'zlib';

@Injectable()
export class PresentationsService implements OnModuleInit {
  private bucket: mongo.GridFSBucket;

  constructor(
    @InjectModel('Presentation') private readonly presentationModel: Model<any>,
  ) { }

  onModuleInit() {
    this.bucket = new mongo.GridFSBucket(this.presentationModel.db.db as any, {
      bucketName: 'uploads',
    });
  }

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

  // 1. Subir archivo a GridFS
  private async saveBase64ToFile(base64String: string, filePrefix: string, extension: string): Promise<string> {
    if (!base64String || base64String.startsWith('http') || base64String.startsWith('/') || base64String.length < 500) {
      return base64String; // Si ya es URL o ruta o está vacío, no hacer nada
    }

    const base64Data = base64String.includes('base64,')
      ? base64String.split('base64,')[1]
      : base64String;

    const fileName = `${filePrefix}_${Date.now()}.${extension}`;
    const buffer = Buffer.from(base64Data, 'base64');

    let contentType = 'application/octet-stream';
    if (extension === 'jpg' || extension === 'jpeg') contentType = 'image/jpeg';
    if (extension === 'png') contentType = 'image/png';
    if (extension === 'pdf') contentType = 'application/pdf';
    if (extension === 'mp3') contentType = 'audio/mpeg';

    try {
      console.log(`📤 Subiendo ${fileName} a MongoDB GridFS...`);
      const uploadStream = this.bucket.openUploadStream(fileName, {
        metadata: { contentType },
      });

      uploadStream.end(buffer);

      return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          const backendUrl = process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://pdfs-bakend.vercel.app' : 'http://localhost:3000');
          const fileUrl = `${backendUrl}/api/upload/file?id=${uploadStream.id}`;
          console.log(`✅ ${fileName} subido a Mongo GridFS:`, fileUrl);
          resolve(fileUrl);
        });

        uploadStream.on('error', (error) => {
          console.error(`❌ Error subiendo ${fileName} a GridFS:`, error.message);
          reject(error);
        });
      });
    } catch (error: any) {
      console.error(`❌ Error en saveBase64ToFile para ${fileName}:`, error.message);
      throw error;
    }
  }

  // 2. EL ASPIRADOR PROFUNDO: Busca y extrae todos los Base64 del JSON
  private async extractAndSaveMedia(dto: any) {
    const uploadPromises: Promise<void>[] = [];

    // A. Portada y PDF Principal
    if (dto.coverImage) {
      uploadPromises.push(
        this.saveBase64ToFile(dto.coverImage, 'cover', 'jpg').then(url => { dto.coverImage = url; })
      );
    }
    if (dto.pdfBase64) {
      uploadPromises.push(
        this.saveBase64ToFile(dto.pdfBase64, 'pdf', 'pdf').then(url => { dto.pdfBase64 = url; })
      );
    }

    // B. Imágenes de fondo de las diapositivas
    if (dto.slideConfigs) {
      for (const page in dto.slideConfigs) {
        if (dto.slideConfigs[page].bgImage) {
          uploadPromises.push(
            this.saveBase64ToFile(dto.slideConfigs[page].bgImage, 'bg', 'jpg')
              .then(url => { dto.slideConfigs[page].bgImage = url; })
          );
        }
      }
    }

    // C. Elementos dentro del lienzo (imágenes, audios)
    if (dto.documentState) {
      for (const page in dto.documentState) {
        if (Array.isArray(dto.documentState[page])) {
          for (const el of dto.documentState[page]) {
            if (el && el.src) {
              const ext = el.type === 'audio' ? 'mp3' : 'png';
              uploadPromises.push(
                this.saveBase64ToFile(el.src, `element_${el.type}`, ext)
                  .then(url => { el.src = url; })
              );
            }
          }
        }
      }
    }

    await Promise.all(uploadPromises);

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