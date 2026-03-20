import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsBoolean, IsString, Length } from "class-validator";

export class CategoryFilterDto {
  @ApiPropertyOptional({
    description: 'Filtra per stato attivo/inattivo',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filtra per categoria padre (null per root)',
    example: 'uuid-parent-123'
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({
    description: 'Filtra per tipo abbigliamento',
    example: 'camicie'
  })
  @IsOptional()
  @IsString()
  clothingType?: string;

  @ApiPropertyOptional({
    description: 'Includi prodotti nella risposta',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includeProducts?: boolean = false;

  @ApiPropertyOptional({
    description: 'Includi categorie figlie',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  includeChildren?: boolean = true;

  @ApiPropertyOptional({
    description: 'Includi categoria padre',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== 'false')
  includeParent?: boolean = true;

  @ApiPropertyOptional({
    description: 'Solo categorie che hanno prodotti',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  hasProducts?: boolean;

  @ApiPropertyOptional({
    description: 'Ricerca per nome',
    example: 'camicie'
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;
}
