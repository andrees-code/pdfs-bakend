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
      .exec()
  }

  findOne(userId: string, noteId: string) {
    return this.noteModel
      .findOne({ _id: noteId, userId })
      .exec()
  }

  delete(userId: string, noteId: string) {
    return this.noteModel.deleteOne({ _id: noteId, userId })
  }

  async toggleFavorite(id: string, userId: string) {
    const note = await this.noteModel.findOne({ _id: id, userId })
    if (!note) throw new NotFoundException()
    note.favorito = !note.favorito
    return note.save()
  }

  async updateTitle(id: string, userId: string, title: string) {
    const note = await this.noteModel.findOne({ _id: id, userId })
    if (!note) throw new NotFoundException('Nota no encontrada')
    note.title = title
    return note.save()
  }

  async updateContent(id: string, userId: string, content: string) {
    const note = await this.noteModel.findOne({ _id: id, userId })
    if (!note) throw new NotFoundException('Nota no encontrada')
    note.content = content
    return note.save()
  }

  async updateColor(id: string, userId: string, color: string) {
    const note = await this.noteModel.findOne({ _id: id, userId })
    if (!note) throw new NotFoundException('Nota no encontrada')
    note.color = color
    return note.save()
  }

  // NUEVO MÉTODO
  async updateDate(id: string, userId: string, date: string | null) {
    const note = await this.noteModel.findOne({ _id: id, userId })
    if (!note) throw new NotFoundException('Nota no encontrada')
    note.calendarDate = date
    return note.save()
  }
}