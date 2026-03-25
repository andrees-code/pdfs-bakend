import { IsString, IsNumber, IsObject, IsOptional, IsIn } from 'class-validator';

export class CreatePresentationDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsIn(['pdf', 'blank'])
  docType: 'pdf' | 'blank';

  @IsNumber()
  baseWidth: number;

  @IsNumber()
  baseHeight: number;

  @IsObject()
  documentState: Record<number, any[]>;

  @IsObject()
  slideConfigs: Record<number, any>;

  @IsObject()
  pdfPageMap: Record<number, number>;

  @IsString()
  @IsOptional()
  pdfBase64?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;
}