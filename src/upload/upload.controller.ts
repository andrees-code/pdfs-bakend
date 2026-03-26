import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import axios from 'axios';

// Directorio de upload configurable y compatible con serverless
const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  console.log('✅ Upload directory ready:', uploadDir);
} catch (error) {
  // En Vercel y otros entornos serverless, el sistema de archivos puede ser de solo lectura
  console.warn('⚠️ No se pudo crear uploadDir, usando /tmp si está disponible:', error.message);
}

@Controller('upload')
export class UploadController {

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    // Configuramos dónde y cómo se guarda (solo fallback local para desarrollo)
    storage: diskStorage({
      destination: (req, file, cb) => {
        const targetDir = fs.existsSync(uploadDir) ? uploadDir : '/tmp';
        cb(null, targetDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    // Si está configurado Cloudinary, subir ahí para evitar 404 en Vercel
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    if (cloudName && uploadPreset) {
      try {
        console.log('📤 Intentando subir a Cloudinary:', { cloudName, uploadPreset, mimetype: file.mimetype });
        const base64 = file.buffer.toString('base64');
        const result = await axios.post(
          `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
          new URLSearchParams({
            file: `data:${file.mimetype};base64,${base64}`,
            upload_preset: uploadPreset
            // Removed folder parameter to avoid conflicts with preset settings
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        console.log('✅ Subida a Cloudinary exitosa:', result.data.secure_url);
        return { url: result.data.secure_url };
      } catch (error) {
        console.warn('⚠️ Error subiendo a Cloudinary:', error.response?.data || error.message || error);
        console.warn('Usando almacenamiento local de fallback');
      }
    } else {
      console.log('⚠️ Cloudinary no configurado, usando almacenamiento local');
    }

    // Fallback a ruta local (ideal solo en desarrollo local)
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const fileUrl = `${backendUrl}/uploads/${file.filename}`;

    return { url: fileUrl };
  }
}