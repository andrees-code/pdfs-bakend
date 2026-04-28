import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { ProjectVersion } from '../shared/schemas/project-version.schema';

// Convertimos los métodos síncronos a Promesas para no bloquear el Event Loop de Node.js
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

@Injectable()
export class PresentationsService {
  constructor(
    @InjectModel('Presentation') private readonly presentationModel: Model<any>,
    @InjectModel(ProjectVersion.name) private readonly projectVersionModel: Model<ProjectVersion>,
  ) { }

  private async decodeCompressedState(compressedState: string) {
    try {
      const decompressed = await gunzip(Buffer.from(compressedState, 'base64'));
      const parsed = JSON.parse(decompressed.toString('utf8'));
      return {
        documentState: parsed.documentState || {},
        slideConfigs: parsed.slideConfigs || {},
        pdfPageMap: parsed.pdfPageMap || {},
      };
    } catch (error: any) {
      console.warn('⚠️ Estado comprimido inválido, se omite:', error.message);
      return { documentState: {}, slideConfigs: {}, pdfPageMap: {} };
    }
  }

  private async buildCompressedState(dto: any): Promise<string> {
    if (dto.compressedState && typeof dto.compressedState === 'string') {
      const decoded = await this.decodeCompressedState(dto.compressedState);
      const compressed = await gzip(Buffer.from(JSON.stringify(decoded), 'utf8'), { level: 6 });
      return compressed.toString('base64');
    }

    const rawState = {
      documentState: dto.documentState || {},
      slideConfigs: dto.slideConfigs || {},
      pdfPageMap: dto.pdfPageMap || {},
    };
    const compressed = await gzip(Buffer.from(JSON.stringify(rawState), 'utf8'), { level: 6 });
    return compressed.toString('base64');
  }

  private generateSlug(length = 8): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = randomBytes(length);
    let slug = '';
    for (let i = 0; i < length; i++) {
      slug += alphabet[bytes[i] % alphabet.length];
    }
    return slug;
  }

  private async ensureUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = this.generateSlug();
      const exists = await this.presentationModel.exists({ slug: candidate });
      if (!exists) return candidate;
    }
    throw new Error('No se pudo generar un slug unico para compartir');
  }

  private buildPresentationMetadata(dto: any) {
    return {
      userId: dto.userId,
      title: dto.title,
      docType: dto.docType,
      baseWidth: dto.baseWidth,
      baseHeight: dto.baseHeight,
      pdfBase64: dto.pdfBase64 || null,
      coverImage: dto.coverImage || null,
      documentState: {},
      slideConfigs: {},
      pdfPageMap: {},
      compressedState: null,
      currentVersionId: null,
    };
  }

  async create(createDto: CreatePresentationDto) {
    console.log('🔄 [Service] Guardando metadata + versión comprimida...');
    try {
      const compressedState = await this.buildCompressedState(createDto);
      const metadata = this.buildPresentationMetadata(createDto);
      const createdPresentation = new this.presentationModel(metadata);
      const result = await createdPresentation.save();

      const createdVersion = await this.projectVersionModel.create({
        entityType: 'presentation',
        entityId: result._id,
        compressedState,
      });

      await this.presentationModel.findByIdAndUpdate(result._id, {
        currentVersionId: createdVersion._id.toString(),
      });

      console.log('✅ [Service] Presentación guardada en BD con ID:', result._id);
      return result;
    } catch (error: any) {
      console.error('❌ [Service] Error en create():', error.message);
      throw error;
    }
  }

  async update(id: string, updateDto: any) {
    console.log('🔄 [Service] Guardando nueva versión comprimida...');
    try {
      const compressedState = await this.buildCompressedState(updateDto);
      const metadata = this.buildPresentationMetadata(updateDto);

      const result = await this.presentationModel.findByIdAndUpdate(id, metadata, { new: true });
      if (!result) {
        return null;
      }

      const createdVersion = await this.projectVersionModel.create({
        entityType: 'presentation',
        entityId: new Types.ObjectId(id),
        compressedState,
      });

      await this.presentationModel.findByIdAndUpdate(id, {
        currentVersionId: createdVersion._id.toString(),
      });

      console.log('✅ [Service] Presentación actualizada');
      return result;
    } catch (error: any) {
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

    const latestVersion = await this.projectVersionModel
      .findOne({ entityType: 'presentation', entityId: new Types.ObjectId(id) })
      .sort({ createdAt: -1 })
      .lean();

    return {
      ...presentation,
      documentState: {},
      slideConfigs: {},
      pdfPageMap: {},
      compressedState: latestVersion?.compressedState || null,
    };
  }

  async findBySlug(slug: string) {
    const presentation = await this.presentationModel.findOne({ slug, isPublic: true }).lean();
    if (!presentation) return null;

    const latestVersion = await this.projectVersionModel
      .findOne({ entityType: 'presentation', entityId: new Types.ObjectId(String(presentation._id)) })
      .sort({ createdAt: -1 })
      .lean();

    await this.presentationModel.updateOne(
      { _id: presentation._id },
      { $inc: { viewCount: 1 } },
    );

    return {
      ...presentation,
      documentState: {},
      slideConfigs: {},
      pdfPageMap: {},
      compressedState: latestVersion?.compressedState || null,
    };
  }

  async publish(id: string) {
    const current = await this.presentationModel.findById(id);
    if (!current) return null;

    const nextSlug = current.slug || (await this.ensureUniqueSlug());
    const updated = await this.presentationModel.findByIdAndUpdate(
      id,
      { isPublic: true, slug: nextSlug },
      { new: true },
    );

    return updated;
  }

  async unpublish(id: string) {
    return this.presentationModel.findByIdAndUpdate(
      id,
      { isPublic: false },
      { new: true },
    );
  }

  async remove(id: string) {
    await this.projectVersionModel.deleteMany({
      entityType: 'presentation',
      entityId: new Types.ObjectId(id),
    });
    return await this.presentationModel.findByIdAndDelete(id);
  }
}