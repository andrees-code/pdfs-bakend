import { IsString, IsNumber, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  userId: string;

  @IsString()
  authorName: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  docType?: string;

  @IsNumber()
  @IsOptional()
  baseWidth?: number;

  @IsNumber()
  @IsOptional()
  baseHeight?: number;

  @IsObject()
  @IsOptional()
  documentState?: Record<number, any[]>;

  @IsObject()
  @IsOptional()
  slideConfigs?: Record<number, any>;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;
}
