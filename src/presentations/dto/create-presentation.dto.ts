import { IsString, IsNumber, IsObject, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreatePresentationDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsIn(['pdf', 'blank', 'pptx'])
  docType: 'pdf' | 'blank' | 'pptx';

  @IsNumber()
  baseWidth: number;

  @IsNumber()
  baseHeight: number;

  @IsObject()
  @IsOptional()
  documentState?: Record<number, any[]>;

  @IsObject()
  @IsOptional()
  slideConfigs?: Record<number, any>;

  @IsObject()
  @IsOptional()
  pdfPageMap?: Record<number, number>;

  @IsString()
  @IsOptional()
  compressedState?: string;

  @IsString()
  @IsOptional()
  @MaxLength(52428800, { message: 'El pdfBase64 no puede exceder 50MB' })  // 50MB en base64 = ~37.5MB original
  pdfBase64?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5242880, { message: 'La coverImage no puede exceder 5MB' })  // 5MB en base64 = ~3.75MB original
  coverImage?: string;
}