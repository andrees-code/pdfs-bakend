import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, mongo } from 'mongoose';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import * as zlib from 'zlib';
import { promisify } from 'util';

// Convertimos los métodos síncronos a Promesas para no bloquear el Event Loop de Node.js
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

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

  private extractUrls(obj: any, urls: Set<string>) {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (obj.includes('/api/upload/file?id=') || obj.includes('/upload/file?id=')) {
        urls.add(obj);
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractUrls(item, urls);
      }
    } else if (typeof obj === 'object') {
      for (const key in obj) {
        this.extractUrls(obj[key], urls);
      }
    }
  }

  private extractGridFsIdFromUrl(url: string): string | null {
    const match = url.match(/id=([a-fA-F0-9]{24})/);
    return match ? match[1] : null;
  }

  private async deleteOldMedia(oldDto: any, newDto: any) {
    const oldUrls = new Set<string>();
    const newUrls = new Set<string>();

    // Extraer profundamente las URLs de la presentación pasada y la nueva
    this.extractUrls(oldDto, oldUrls);
    this.extractUrls(newDto, newUrls);

    // Eliminar cualquier archivo (chunk) que exista en el pasado pero ya no se envíe ahora
    for (const url of oldUrls) {
      if (!newUrls.has(url)) {
        const fileId = this.extractGridFsIdFromUrl(url);
        if (fileId) {
          try {
            console.log(`🗑️ Eliminando archivo huérfano de GridFS: ${fileId}`);
            await this.bucket.delete(new mongo.ObjectId(fileId));
          } catch (e) {
            console.warn(`⚠️ No se pudo eliminar el archivo ${fileId}:`, e.message);
          }
        }
      }
    }
  }

  private async decompressStateFields(dto: any) {
    if (dto.compressedState) {
      try {
        const decompressed = await gunzip(Buffer.from(dto.compressedState, 'base64'));
        const parsed = JSON.parse(decompressed.toString('utf8'));

        dto.documentState = parsed.documentState || {};
        dto.slideConfigs = parsed.slideConfigs || {};
        dto.pdfPageMap = parsed.pdfPageMap || {};

        // Mantener compressedState para guardarlo en DB si no se sobrescribe
      } catch (error) {
        console.warn('⚠️ No se pudo descomprimir compressedState:', error.message);
      }
    }
  }

  private async compressStateFields(dto: any) {
    try {
      const rawObject = {
        documentState: dto.documentState || {},
        slideConfigs: dto.slideConfigs || {},
        pdfPageMap: dto.pdfPageMap || {},
      };

      const rawJson = JSON.stringify(rawObject);
      // Reducido a 2MB para comprimir antes y ahorrar espacio/ancho de banda
      if (rawJson.length > 2 * 1024 * 1024) {
        const compressed = await gzip(Buffer.from(rawJson, 'utf8'), { level: 6 });
        dto.compressedState = compressed.toString('base64');

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

    // A. PDF Principal (La portada ahora se guarda ligera directo en BD para no saturar GridFS)
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
      await this.decompressStateFields(createDto);

      // Limpiamos los Base64 antes de crear
      const cleanedDto = await this.extractAndSaveMedia(createDto);

      // Para optimizar almacenamiento y respuestas, comprimimos el estado pesado si es grande
      await this.compressStateFields(cleanedDto);

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
      // 1. Obtenemos la versión antigua tal como está en BD antes de sobreescribirla
      const oldPresentation = await this.presentationModel.findById(id).lean();
      if (oldPresentation) {
        await this.decompressStateFields(oldPresentation);
      }

      await this.decompressStateFields(updateDto);

      // 2. Limpiamos y guardamos los nuevos Base64 de la actualización actual
      const cleanedDto = await this.extractAndSaveMedia(updateDto);

      // 3. Se deshabilita la eliminación automática para prevenir la pérdida de assets.
      // La función deleteOldMedia era demasiado agresiva y eliminaba archivos que aún podían ser necesarios (ej. en el historial de deshacer).
      // if (oldPresentation) {
      //   await this.deleteOldMedia(oldPresentation, cleanedDto);
      // }

      // Para optimizar almacenamiento y respuestas, comprimimos el estado pesado si es grande
      await this.compressStateFields(cleanedDto);

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
    // 🚀 OPTIMIZACIÓN CRÍTICA: No enviar los estados gigantes al cargar la biblioteca. 
    // Solo necesitamos los metadatos y el coverImage. Esto acelera la carga en un 90%.
    return await query.select('-pdfBase64 -compressedState -documentState -slideConfigs -pdfPageMap').sort({ updatedAt: -1 }).exec();
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
        const compressedBuffer = await gzip(Buffer.from(rawJson, 'utf8'), { level: 6 });
        const compressedStr = compressedBuffer.toString('base64');
        await this.presentationModel.findByIdAndUpdate(id, {
          compressedState: compressedStr,
          documentState: {},
          slideConfigs: {},
          pdfPageMap: {},
        });

        return {
          ...presentation,
          documentState: {},
          slideConfigs: {},
          pdfPageMap: {},
          compressedState: compressedStr,
        };
      }
    } catch (error) {
      console.warn('⚠️ No se pudo recomprimir en findOne:', error.message);
    }

    return presentation;
  }

  async remove(id: string) {
    // Obtener la presentación antes de borrarla para destruir todos sus chunks
    const presentation = await this.presentationModel.findById(id).lean();
    if (presentation) {
      await this.decompressStateFields(presentation);
      // Comparar contra objeto vacío ({}) fuerza la eliminación de todos sus archivos.
      await this.deleteOldMedia(presentation, {}); 
    }

    return await this.presentationModel.findByIdAndDelete(id);
  }
}