import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, Length, IsOptional, Matches, IsUrl, IsNumber, Min, IsBoolean, IsUUID } from "class-validator";
import { ClothingCategory } from "src/database/enums/clothing-category.enum";

export class CreateCategoryDto {
  @ApiProperty({ description: 'Nome della categoria', example: 'Camicie', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ description: 'Descrizione della categoria' })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @ApiProperty({ description: 'Slug URL-friendly', example: 'camicie', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug deve contenere solo lettere minuscole, numeri e trattini'
  })
  slug: string;

  @ApiPropertyOptional({ description: 'URL immagine della categoria' })
  @IsOptional()
  @IsString()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({ description: 'Ordine di visualizzazione', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value) : 0)
  sortOrder?: number = 0;

  @ApiPropertyOptional({ description: 'Se la categoria è attiva', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== false)
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'ID categoria padre (per gerarchia)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Tipo abbigliamento', enum: ClothingCategory })
  @IsOptional()
  @IsString()
  clothingType?: ClothingCategory;

  @ApiPropertyOptional({ description: 'Titolo meta per SEO', maxLength: 60 })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'Descrizione meta per SEO', maxLength: 160 })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  metaDescription?: string;
}
