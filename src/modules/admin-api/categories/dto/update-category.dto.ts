import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches, IsUrl, IsNumber, Min, IsBoolean, IsUUID } from "class-validator";
import { ClothingCategory } from "src/database/enums/clothing-category.enum";

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Nome della categoria', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ description: 'Descrizione della categoria' })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Slug URL-friendly', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug deve contenere solo lettere minuscole, numeri e trattini'
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'URL immagine della categoria' })
  @IsOptional()
  @IsString()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({ description: 'Ordine di visualizzazione', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Se la categoria è attiva' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'ID categoria padre (null per root)' })
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
