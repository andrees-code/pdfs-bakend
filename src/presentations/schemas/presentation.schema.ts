import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PresentationDocument = Presentation & Document;

@Schema({ timestamps: true }) // Añade createdAt y updatedAt automáticamente
export class Presentation {
  
  @Prop({ required: true })
  userId: string;

  @Prop({ default: 'Presentación sin título' })
  title: string;

  @Prop({ required: true, enum: ['pdf', 'blank', 'pptx'] })
  docType: string;

  @Prop({ default: 1280 })
  baseWidth: number;

  @Prop({ default: 720 })
  baseHeight: number;

  @Prop({ type: Object })
  documentState: Record<number, any[]>;

  @Prop({ type: Object })
  slideConfigs: Record<number, any>;

  @Prop({ type: Object })
  pdfPageMap: Record<number, number>;

  @Prop({ type: String, default: null })
  compressedState: string;

  @Prop({ default: null })
  pdfBase64: string;

  @Prop({ type: String, default: null })
  coverImage: string;
}

export const PresentationSchema = SchemaFactory.createForClass(Presentation);