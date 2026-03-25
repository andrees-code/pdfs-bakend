import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'

import { Note, NoteSchema } from './schemas/note.schema'
import { NotesController } from './notes.controller'
import { NotesService } from './notes.service'
import { JwtStrategy } from '../user/jwt.strategy'
import { UserModule } from '../user/user.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Note.name, schema: NoteSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UserModule
  ],
  controllers: [NotesController],
  providers: [NotesService]
})
export class NotesModule {}
