import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Note extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId

  @Prop()
  title: string

  @Prop()
  type: string // Documento, Nota, Post-it

  @Prop({ type: String, default: '' })
  content: string

  @Prop({ default: 'bg-yellow-200' })
  color: string // solo para Post-its

  @Prop({ default: false })
  favorito: boolean

  // NUEVO CAMPO
  @Prop({ type: String, required: false, default: null })
  calendarDate: string | null 
}

export const NoteSchema = SchemaFactory.createForClass(Note)