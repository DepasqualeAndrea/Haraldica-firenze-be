import {  ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsNumber, Min, Max, IsString, Length, IsArray, IsUrl, ArrayMaxSize } from 'class-validator';

export class UpdateReviewDto {
  @ApiPropertyOptional({ 
    description: 'Nuova valutazione',
    minimum: 1,
    maximum: 5,
    example: 5 
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  rating?: number;

  @ApiPropertyOptional({ 
    description: 'Nuovo titolo',
    minLength: 5,
    maxLength: 100 
  })
  @IsOptional()
  @IsString()
  @Length(5, 100)
  title?: string;

  @ApiPropertyOptional({ 
    description: 'Nuovo commento',
    minLength: 20,
    maxLength: 2000 
  })
  @IsOptional()
  @IsString()
  @Length(20, 2000)
  comment?: string;

  @ApiPropertyOptional({ 
    description: 'Nuove immagini (sostituisce quelle esistenti)',
    type: [String] 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  @ArrayMaxSize(5)
  images?: string[];
}