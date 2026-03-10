import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Presentation, PresentationDocument } from './schemas/presentation.schema';
import { CreatePresentationDto } from './dto/create-presentation.dto';

@Injectable()
export class PresentationsService {
  constructor(
    @InjectModel(Presentation.name) private presentationModel: Model<PresentationDocument>,
  ) {}

  async create(createPresentationDto: CreatePresentationDto): Promise<Presentation> {
    const createdPresentation = new this.presentationModel(createPresentationDto);
    return createdPresentation.save();
  }

  async findAll(): Promise<Presentation[]> {
    // Excluimos el pdfBase64 para que la lista cargue ultra rápido
    return this.presentationModel.find().select('-pdfBase64').sort({ updatedAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Presentation> {
    const presentation = await this.presentationModel.findById(id).exec();
    if (!presentation) {
      throw new NotFoundException(`Presentación con ID ${id} no encontrada`);
    }
    return presentation;
  }

  async update(id: string, updatePresentationDto: CreatePresentationDto): Promise<Presentation> {
    const updatedPresentation = await this.presentationModel
      .findByIdAndUpdate(id, updatePresentationDto, { new: true })
      .exec();
      
    if (!updatedPresentation) {
      throw new NotFoundException(`Presentación con ID ${id} no encontrada`);
    }
    return updatedPresentation;
  }

  async remove(id: string): Promise<void> {
    const result = await this.presentationModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Presentación con ID ${id} no encontrada`);
    }
  }
}