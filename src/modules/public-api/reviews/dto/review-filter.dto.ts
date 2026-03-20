import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, IsNumber, Min, Max, IsBoolean, IsDateString, IsEnum } from "class-validator";

export class ReviewFilterDto {
  @ApiPropertyOptional({ 
    description: 'Filtra per ID prodotto',
    example: 'uuid-product-123' 
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ 
    description: 'Filtra per ID utente',
    example: 'uuid-user-456' 
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ 
    description: 'Valutazione minima',
    minimum: 1,
    maximum: 5,
    example: 3 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  minRating?: number;

  @ApiPropertyOptional({ 
    description: 'Valutazione massima',
    minimum: 1,
    maximum: 5,
    example: 5 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  maxRating?: number;

  @ApiPropertyOptional({ 
    description: 'Solo acquisti verificati',
    example: true 
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isVerifiedPurchase?: boolean;

  @ApiPropertyOptional({ 
    description: 'Solo recensioni approvate',
    example: true 
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isApproved?: boolean;

  @ApiPropertyOptional({ 
    description: 'Solo recensioni in evidenza',
    example: false 
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isFeatured?: boolean;

  @ApiPropertyOptional({ 
    description: 'Con immagini',
    example: true 
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  hasImages?: boolean;

  @ApiPropertyOptional({ 
    description: 'Con risposta del negozio',
    example: false 
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  hasStoreResponse?: boolean;

  @ApiPropertyOptional({ 
    description: 'Data inizio periodo',
    example: '2024-01-01' 
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ 
    description: 'Data fine periodo',
    example: '2024-12-31' 
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ 
    description: 'Ordinamento',
    enum: ['newest', 'oldest', 'highest_rating', 'lowest_rating', 'most_helpful'],
    example: 'newest' 
  })
  @IsOptional()
  @IsEnum(['newest', 'oldest', 'highest_rating', 'lowest_rating', 'most_helpful'])
  sortBy?: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating' | 'most_helpful';

  @ApiPropertyOptional({ 
    description: 'Numero di risultati per pagina',
    minimum: 1,
    maximum: 100,
    example: 20 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => value ? parseInt(value) : 20)
  limit?: number = 20;

  @ApiPropertyOptional({ 
    description: 'Offset per paginazione',
    minimum: 0,
    example: 0 
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => value ? parseInt(value) : 0)
  offset?: number = 0;
}