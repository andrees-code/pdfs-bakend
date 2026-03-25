import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

// Directorio de upload configurable y compatible con serverless
const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';

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
    // Configuramos dónde y cómo se guarda
    storage: diskStorage({
      destination: (req, file, cb) => {
        // Si no se puede usar uploadDir, fallback a /tmp
        const targetDir = fs.existsSync(uploadDir) ? uploadDir : '/tmp';
        cb(null, targetDir);
      },
      filename: (req, file, cb) => {
        // Generamos un nombre único: file-16123456789-123456.jpg
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
      },
    }),
    // Límite de tamaño: 50MB (ajusta según tus necesidades)
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    // Construimos la URL pública (dinámica según entorno)
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'
    const fileUrl = `${backendUrl}/uploads/${file.filename}`

    // Devolvemos el mismo formato JSON que espera nuestro frontend en Vue
    return { url: fileUrl };
  }
}