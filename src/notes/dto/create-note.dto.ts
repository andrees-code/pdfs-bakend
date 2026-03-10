import { IsString, IsOptional } from 'class-validator'

export class CreateNoteDto {
  @IsString()
  title: string

  @IsString()
  type: string

  @IsString()
  @IsOptional()
  content?: string

  @IsString()
  @IsOptional()
  color?: string

  // NUEVO CAMPO
  @IsString()
  @IsOptional()
  calendarDate?: string
}