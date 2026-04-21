import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TemplateDocument = Template & Document;

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  authorName: string;

  @Prop({ default: 'Plantilla sin título' })
  title: string;

  @Prop({ default: 'template' })
  docType: string;

  @Prop({ default: 1280 })
  baseWidth: number;

  @Prop({ default: 720 })
  baseHeight: number;

  @Prop({ type: Object })
  documentState: Record<number, any[]>;

  @Prop({ type: Object })
  slideConfigs: Record<number, any>;

  @Prop({ type: String, default: null })
  coverImage: string;

  @Prop({ default: true })
  isPrivate: boolean;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
