import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTemplateDto } from './dto/create-template.dto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { ProjectVersion } from '../shared/schemas/project-version.schema';

const gzip = promisify(zlib.gzip);

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel('Template') private readonly templateModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel(ProjectVersion.name) private readonly projectVersionModel: Model<ProjectVersion>,
  ) {}

  private buildTemplateMetadata(dto: CreateTemplateDto, forcedUserId?: string) {
    return {
      userId: forcedUserId || dto.userId,
      authorName: dto.authorName,
      title: dto.title,
      docType: dto.docType,
      baseWidth: dto.baseWidth,
      baseHeight: dto.baseHeight,
      coverImage: dto.coverImage || null,
      isPrivate: dto.isPrivate ?? true,
      documentState: {},
      slideConfigs: {},
      currentVersionId: null,
    };
  }

  private async buildCompressedState(dto: CreateTemplateDto): Promise<string> {
    if (dto.compressedState && typeof dto.compressedState === 'string') {
      return dto.compressedState;
    }

    const rawState = {
      documentState: dto.documentState || {},
      slideConfigs: dto.slideConfigs || {},
      pdfPageMap: dto.pdfPageMap || {},
    };
    const compressed = await gzip(Buffer.from(JSON.stringify(rawState), 'utf8'), { level: 6 });
    return compressed.toString('base64');
  }

  async create(dto: CreateTemplateDto) {
    const metadata = this.buildTemplateMetadata(dto);
    const compressedState = await this.buildCompressedState(dto);
    const template = new this.templateModel(metadata);
    const savedTemplate = await template.save();

    const createdVersion = await this.projectVersionModel.create({
      entityType: 'template',
      entityId: savedTemplate._id,
      compressedState,
    });

    await this.templateModel.findByIdAndUpdate(savedTemplate._id, {
      currentVersionId: createdVersion._id.toString(),
    });

    return savedTemplate;
  }

  async updateTemplate(templateId: string, userId: string, dto: CreateTemplateDto) {
    const existing = await this.templateModel.findById(templateId).exec();
    if (!existing) throw new NotFoundException('Plantilla no encontrada');

    if (String(existing.userId) !== String(userId)) {
      throw new ForbiddenException('No autorizado para actualizar esta plantilla');
    }

    const metadata = this.buildTemplateMetadata(dto, existing.userId);
    const compressedState = await this.buildCompressedState(dto);

    const updated = await this.templateModel
      .findByIdAndUpdate(templateId, metadata, { new: true })
      .exec();

    const createdVersion = await this.projectVersionModel.create({
      entityType: 'template',
      entityId: new Types.ObjectId(templateId),
      compressedState,
    });

    await this.templateModel.findByIdAndUpdate(templateId, {
      currentVersionId: createdVersion._id.toString(),
    });

    return updated;
  }

  async getPublicTemplates() {
    return this.templateModel
      .find({ isPrivate: false })
      .select('-documentState -slideConfigs')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getUserTemplates(userId: string) {
    const user = await this.userModel.findById(userId).select('savedTemplates').exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const savedIds: string[] = user.savedTemplates || [];

    // Plantillas propias (privadas o públicas creadas por el usuario)
    const ownTemplates = await this.templateModel
      .find({ userId })
      .select('-documentState -slideConfigs')
      .sort({ createdAt: -1 })
      .exec();

    // Plantillas guardadas de la tienda (de otros autores)
    const savedTemplates = await this.templateModel
      .find({ _id: { $in: savedIds }, userId: { $ne: userId } })
      .select('-documentState -slideConfigs')
      .exec();

    return [...ownTemplates, ...savedTemplates];
  }

  async getTemplateById(id: string) {
    const template = await this.templateModel.findById(id).lean().exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    const latestVersion = await this.projectVersionModel
      .findOne({ entityType: 'template', entityId: new Types.ObjectId(id) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      ...template,
      documentState: {},
      slideConfigs: {},
      compressedState: latestVersion?.compressedState || null,
    };
  }

  async saveToGallery(templateId: string, userId: string) {
    const template = await this.templateModel.findById(templateId).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    await this.userModel.findByIdAndUpdate(
      userId,
      { $addToSet: { savedTemplates: templateId } },
    ).exec();

    return { message: 'Plantilla guardada en tu galería' };
  }

  async removeFromGallery(templateId: string, userId: string) {
    await this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { savedTemplates: templateId } },
    ).exec();

    return { message: 'Plantilla eliminada de tu galería' };
  }

  async publishTemplate(templateId: string, userId: string) {
    const template = await this.templateModel.findById(templateId).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    if (String(template.userId) !== String(userId)) {
      throw new ForbiddenException('No autorizado para publicar esta plantilla');
    }

    template.isPrivate = false;
    await template.save();

    return { message: 'Plantilla publicada correctamente', template };
  }

  async deleteTemplate(templateId: string, userId: string) {
    const template = await this.templateModel.findById(templateId).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    if (String(template.userId) !== String(userId)) {
      throw new ForbiddenException('No autorizado para eliminar esta plantilla');
    }

    await this.projectVersionModel.deleteMany({
      entityType: 'template',
      entityId: new Types.ObjectId(templateId),
    });
    await this.templateModel.findByIdAndDelete(templateId).exec();
    await this.userModel.updateMany(
      {},
      { $pull: { savedTemplates: templateId } },
    ).exec();

    return { message: 'Plantilla eliminada correctamente' };
  }
}
