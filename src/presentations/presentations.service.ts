import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class PresentationsService {
  constructor(
    @InjectModel('Presentation') private readonly presentationModel: Model<any>,
  ) { }

  // 1. Guardar archivo físico o subir a Cloudinary
  private async saveBase64ToFile(base64String: string, filePrefix: string, extension: string): Promise<string> {
    if (!base64String || base64String.startsWith('http') || base64String.length < 500) {
      return base64String; // Si ya es URL o está vacío, no hacer nada
    }

    // Intentar subir a Cloudinary si está configurado
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    if (cloudName && uploadPreset) {
      try {
        console.log(`📤 Subiendo ${filePrefix} a Cloudinary...`);
        const result = await axios.post(
          `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
          new URLSearchParams({
            file: `data:image/${extension === 'pdf' ? 'pdf' : 'jpeg'};base64,${base64String.includes('base64,') ? base64String.split('base64,')[1] : base64String}`,
            upload_preset: uploadPreset
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log(`✅ ${filePrefix} subido a Cloudinary:`, result.data.secure_url);
        return result.data.secure_url;
      } catch (error) {
        console.warn(`⚠️ Error subiendo ${filePrefix} a Cloudinary:`, error.response?.data || error.message);
        console.warn('Usando almacenamiento local de fallback');
      }
    } else {
      console.log('⚠️ Cloudinary no configurado, usando almacenamiento local');
    }

    // Fallback a archivo local (solo para desarrollo)
    const envUploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    let uploadDir = path.isAbsolute(envUploadDir) ? envUploadDir : path.join(process.cwd(), envUploadDir);

    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (error) {
      console.warn('⚠️ No se pudo crear uploadDir, usando /tmp:', error.message);
      uploadDir = '/tmp/uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    }

    const base64Data = base64String.includes('base64,')
      ? base64String.split('base64,')[1]
      : base64String;

    const fileName = `${filePrefix}_${Date.now()}.${extension}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, base64Data, 'base64');

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'
    return `${backendUrl}/uploads/${fileName}`
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
      // Limpiamos los Base64 antes de crear
      const cleanedDto = await this.extractAndSaveMedia(createDto);
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
      // Limpiamos los Base64 antes de actualizar
      const cleanedDto = await this.extractAndSaveMedia(updateDto);
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
    return await this.presentationModel.findById(id);
  }

  async remove(id: string) {
    return await this.presentationModel.findByIdAndDelete(id);
  }
}