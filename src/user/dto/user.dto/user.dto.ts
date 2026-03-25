import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

/* =========================
   SUBSCRIPTION DTO
========================= */

export class SubscriptionDto {
  @IsOptional()
  @IsEnum(['free', 'monthly', 'yearly'])
  plan?: 'free' | 'monthly' | 'yearly';

  @IsOptional()
  @IsEnum(['active', 'expired', 'canceled'])
  status?: 'active' | 'expired' | 'canceled';

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

/* =========================
   USER DTO
========================= */

export class UserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(['user', 'admin'])
  role?: 'user' | 'admin';

  @IsOptional()
  @IsString()
  avatar?: string;

  // 👇 NUEVO (Stripe-ready)
  @IsOptional()
  @ValidateNested()
  @Type(() => SubscriptionDto)
  subscription?: SubscriptionDto;
}
