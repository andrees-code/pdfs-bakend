import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { Response } from 'express';
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

  @Get('file')
  async getFileProxy(@Query('url') url: string, @Res() res: Response) {
    if (!url || !url.includes('.vercel-storage.com')) {
      return res.status(400).send('URL inválida o no pertenece a Vercel Blob');
    }

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        },
      });

      if (!response.ok) {
        return res.status(response.status).send(`Error fetching from blob: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Convertir a buffer y enviarlo (funciona en Node 18+)
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } catch (error: any) {
      console.error('Error in getFileProxy:', error);
      res.status(500).send('Internal Server Error al hacer proxy del archivo');
    }
  }
}