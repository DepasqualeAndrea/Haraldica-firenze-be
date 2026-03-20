// src/modules/admin-api/newsletter/dto/create-newsletter.dto.ts

import {
  IsString,
  IsOptional,
  IsDateString,
  IsObject,
  IsNumber,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsletterTargetAudience, NewsletterDiscountCode } from 'src/database/entities/newsletter.entity';

export class CreateNewsletterDto {
  @ApiProperty({ description: 'Oggetto della newsletter' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject: string;

  @ApiProperty({ description: 'Contenuto HTML della newsletter' })
  @IsString()
  @MinLength(10)
  content: string;

  @ApiPropertyOptional({ description: 'Testo anteprima (preheader)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  previewText?: string;

  @ApiPropertyOptional({ description: 'Testo del pulsante CTA' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ctaText?: string;

  @ApiPropertyOptional({ description: 'URL del pulsante CTA' })
  @IsOptional()
  @IsUrl()
  ctaUrl?: string;

  @ApiPropertyOptional({ description: 'URL immagine header' })
  @IsOptional()
  @IsUrl()
  headerImage?: string;

  @ApiPropertyOptional({ description: 'Data/ora invio programmato (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Nome campagna per tracking' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaignName?: string;

  @ApiPropertyOptional({ description: 'Target audience filters' })
  @IsOptional()
  @IsObject()
  targetAudience?: NewsletterTargetAudience;

  @ApiPropertyOptional({ description: 'Codice sconto associato' })
  @IsOptional()
  @IsObject()
  discountCode?: NewsletterDiscountCode;
}

export class UpdateNewsletterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  previewText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ctaText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  ctaUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  headerImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  targetAudience?: NewsletterTargetAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  discountCode?: NewsletterDiscountCode;
}

export class NewsletterFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}
