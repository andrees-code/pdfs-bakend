import { Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Note } from "./schemas/note.schema"
import { CreateNoteDto } from "./dto/create-note.dto"

@Injectable()
export class NotesService {
  constructor(
    @InjectModel(Note.name)
    private noteModel: Model<Note>,
  ) {}

  create(userId: string, dto: CreateNoteDto) {
    return this.noteModel.create({ ...dto, userId })
  }

  findAllByUser(userId: string) {
    return this.noteModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec()
  }

  findOne(userId: string, noteId: string) {
    return this.noteModel
      .findOne({ _id: noteId, userId })
      .lean()
      .exec()
  }

  delete(userId: string, noteId: string) {
    return this.noteModel.deleteOne({ _id: noteId, userId })
  }

  async toggleFavorite(id: string, userId: string) {
    const note = await this.noteModel.findOne({ _id: id, userId }).lean()
    if (!note) throw new NotFoundException()
    return this.noteModel.findByIdAndUpdate(
      id,
      { favorito: !note.favorito },
      { new: true },
    )
  }

  async updateTitle(id: string, userId: string, title: string) {
    const updated = await this.noteModel.findOneAndUpdate(
      { _id: id, userId },
      { title },
      { new: true },
    )
    if (!updated) throw new NotFoundException('Nota no encontrada')
    return updated
  }

  async updateContent(id: string, userId: string, content: string) {
    const updated = await this.noteModel.findOneAndUpdate(
      { _id: id, userId },
      { content },
      { new: true },
    )
    if (!updated) throw new NotFoundException('Nota no encontrada')
    return updated
  }

  async updateColor(id: string, userId: string, color: string) {
    const updated = await this.noteModel.findOneAndUpdate(
      { _id: id, userId },
      { color },
      { new: true },
    )
    if (!updated) throw new NotFoundException('Nota no encontrada')
    return updated
  }

  // NUEVO MÉTODO
  async updateDate(id: string, userId: string, date: string | null) {
    const updated = await this.noteModel.findOneAndUpdate(
      { _id: id, userId },
      { calendarDate: date },
      { new: true },
    )
    if (!updated) throw new NotFoundException('Nota no encontrada')
    return updated
  }
}