import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AssetDocument = HydratedDocument<Asset>;

@Schema({ timestamps: true })
export class Asset {
  @Prop({ required: true, unique: true, index: true })
  hash: string;

  @Prop({ required: true })
  url: string;

  @Prop({ default: 1 })
  refCount: number;

  @Prop({ type: String, default: null })
  mimeType: string | null;

  @Prop({ type: Number, default: 0 })
  bytes: number;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
