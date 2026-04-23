import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectVersionDocument = HydratedDocument<ProjectVersion>;

@Schema({ timestamps: true })
export class ProjectVersion {
  @Prop({ required: true, enum: ['presentation', 'template'], index: true })
  entityType: 'presentation' | 'template';

  @Prop({ type: Types.ObjectId, required: true, index: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  compressedState: string;
}

export const ProjectVersionSchema = SchemaFactory.createForClass(ProjectVersion);
ProjectVersionSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
