import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  OnModuleInit
} from '@nestjs/common';
import { Response, Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';

@Controller('upload')
export class UploadController implements OnModuleInit {
  private bucket: mongo.GridFSBucket;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    this.bucket = new mongo.GridFSBucket(this.connection.db as any, {
      bucketName: 'uploads',
    });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    
    // Generamos un nombre único seguro
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'); // Sanitizar nombre
    const fileName = `${uniqueSuffix}_${originalName}`;

    try {
      console.log(`📤 Subiendo ${fileName} a MongoDB GridFS...`);

      const uploadStream = this.bucket.openUploadStream(fileName, {
        metadata: { contentType: file.mimetype },
      });

      uploadStream.end(file.buffer);

      return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          console.log(`✅ Archivo subido exitosamente a Mongo GridFS con ID: ${uploadStream.id}`);
          
          // Determine base URL dynamically
          const host = req.get('host') || 'localhost:3000';
          const protocol = req.protocol || 'http';
          // Use hardcoded https if deployed, else fallback to req protocol.
          const baseUrl = host.includes('vercel.app') ? `https://${host}` : `${protocol}://${host}`;
          
          const fileUrl = `${baseUrl}/api/upload/file?id=${uploadStream.id}`;
          resolve({ url: fileUrl });
        });

        uploadStream.on('error', (error) => {
          console.error(`❌ Error al subir archivo a GridFS:`, error);
          reject(new BadRequestException(`Error interno subiendo archivo: ${error.message}`));
        });
      });

    } catch (error: any) {
      console.error(`❌ Error al subir archivo a MongoDB:`, error.message || error);
      throw new BadRequestException(`Error al guardar archivo localmente: ${error.message || 'Desconocido'}`);
    }
  }

  @Get('file')
  async getFileProxy(@Query('id') id: string, @Query('url') legacyUrl: string, @Res() res: Response) {
    // Si viene la URL antigua de Vercel e intentan acceder, simplemente podemos devolver bad request 
    // pero idealmente ahora solo aceptamos `id` como un ObjectId de Mongo.
    if (!id && legacyUrl) {
       console.warn('⚠️ Se intentó cargar una URL de Vercel antigua usando el proxy, pero el proxy ya no funciona con Vercel.');
       return res.status(404).send('Archivo no encontrado de fuentes nativas heredadas.');
    }

    if (!id || !mongo.ObjectId.isValid(id)) {
      return res.status(400).send('ID de archivo inválido o ausente');
    }

    try {
      const objId = new mongo.ObjectId(id);
      
      // Buscar información del archivo para establecer el Content-Type
      const filesInfo = await this.bucket.find({ _id: objId }).toArray();
      if (filesInfo.length === 0) {
        return res.status(404).send('Archivo no encontrado en GridFS');
      }

      const fileInfo = filesInfo[0];
      if (fileInfo.metadata && fileInfo.metadata.contentType) {
        res.setHeader('Content-Type', fileInfo.metadata.contentType as string);
      }

      // Con el stream de descarga podemos mandar los datos al res on the fly
      const downloadStream = this.bucket.openDownloadStream(objId);

      downloadStream.on('error', (error) => {
        console.error('❌ Error enviando stream de archivo:', error);
        if (!res.headersSent) {
          res.status(500).send('Error interno descargando el archivo');
        }
      });

      downloadStream.pipe(res);

    } catch (error: any) {
      console.error('Error en getFileProxy (GridFS):', error);
      res.status(500).send('Internal Server Error al obtener el archivo');
    }
  }
}