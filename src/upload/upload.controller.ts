import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Asset } from './schemas/asset.schema';

@Controller('upload')
export class UploadController {
  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<Asset>,
    @Inject(CloudinaryService) private readonly cloudinaryService: CloudinaryService,
  ) {}

  private async uploadAndDeduplicate(
    file: Express.Multer.File,
    folder = 'docflow-assets',
    resourceType: 'auto' | 'image' | 'video' | 'raw' = 'auto',
  ) {
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existingAsset = await this.assetModel.findOne({ hash }).exec();

    if (existingAsset) {
      existingAsset.refCount += 1;
      await existingAsset.save();
      return {
        url: existingAsset.url,
        deduplicated: true,
        hash,
      };
    }

    const upload = await this.cloudinaryService.uploadBuffer(file.buffer, folder, {
      resource_type: resourceType,
    });

    await this.assetModel.create({
      hash,
      url: upload.secureUrl,
      refCount: 1,
      mimeType: file.mimetype,
      bytes: file.size,
    });

    return {
      url: upload.secureUrl,
      deduplicated: false,
      hash,
    };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @Body('resourceType') resourceType?: 'auto' | 'image' | 'video' | 'raw',
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    return this.uploadAndDeduplicate(file, folder || 'docflow-assets', resourceType || 'auto');
  }

  @Post('media')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @Body('resourceType') resourceType?: 'auto' | 'image' | 'video' | 'raw',
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    return this.uploadAndDeduplicate(file, folder || 'docflow-assets', resourceType || 'auto');
  }

  @Get('file')
  async getFileProxy(@Query('id') id: string, @Query('url') legacyUrl: string, @Res() res: Response) {
    if (legacyUrl) {
      return res.redirect(legacyUrl);
    }

    if (id) {
      const legacyAsset = await this.assetModel.findById(id).lean();
      if (legacyAsset?.url) {
        return res.redirect(legacyAsset.url);
      }
    }

    return res.status(410).send('Proxy legacy de GridFS retirado. Usa /upload/media.');
  }
}