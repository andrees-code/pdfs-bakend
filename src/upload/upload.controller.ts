import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { put } from '@vercel/blob';

@Controller('upload')
export class UploadController {

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    // Generamos un nombre único seguro
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'); // Sanitizar nombre
    const fileName = `uploads/${uniqueSuffix}_${originalName}`;

    try {
      console.log(`📤 Subiendo ${fileName} a Vercel Blob...`);
      
      const { url } = await put(fileName, file.buffer, {
        access: 'private', // Cambiado a private para coincidir con la configuración de tu Vercel Blob
        token: process.env.BLOB_READ_WRITE_TOKEN,
        multipart: true, // 🔥 REQUERIDO: Permite subir PDFs/PPTXs pesados dividiéndolos en partes
      });

      console.log(`✅ Archivo subido exitosamente a Vercel Blob: ${url}`);
      return { url };
    } catch (error: any) {
      console.error(`❌ Error al subir archivo a Vercel Blob:`, error.message || error);
      throw new BadRequestException(`Error al subir a la nube: ${error.message || 'Desconocido'}`);
    }
  }
}