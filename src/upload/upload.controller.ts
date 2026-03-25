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

// Asegurarnos de que la carpeta existe al iniciar
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

@Controller('upload')
export class UploadController {

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    // Configuramos dónde y cómo se guarda
    storage: diskStorage({
      destination: uploadDir,
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