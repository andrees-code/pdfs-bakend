import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel('Template') private readonly templateModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
  ) {}

  async create(dto: CreateTemplateDto) {
    const template = new this.templateModel(dto);
    return template.save();
  }

  async updateTemplate(templateId: string, userId: string, dto: CreateTemplateDto) {
    const existing = await this.templateModel.findById(templateId).exec();
    if (!existing) throw new NotFoundException('Plantilla no encontrada');

    if (String(existing.userId) !== String(userId)) {
      throw new ForbiddenException('No autorizado para actualizar esta plantilla');
    }

    return this.templateModel
      .findByIdAndUpdate(templateId, { ...dto, userId: existing.userId }, { new: true })
      .exec();
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
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
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

    await this.templateModel.findByIdAndDelete(templateId).exec();
    await this.userModel.updateMany(
      {},
      { $pull: { savedTemplates: templateId } },
    ).exec();

    return { message: 'Plantilla eliminada correctamente' };
  }
}
