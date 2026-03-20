import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, IsUUID, IsNumber, Min, Max, Length, IsOptional, IsArray, IsUrl, ArrayMaxSize } from "class-validator";

export class CreateReviewDto {
  @ApiProperty({ 
    description: 'ID del prodotto da recensire',
    example: 'uuid-product-123' 
  })
  @IsString()
  @IsUUID()
  productId: string;

  @ApiProperty({ 
    description: 'Valutazione da 1 a 5 stelle',
    minimum: 1,
    maximum: 5,
    example: 4.5 
  })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  @Transform(({ value }) => parseFloat(value))
  rating: number;

  @ApiProperty({ 
    description: 'Titolo della recensione',
    example: 'Ottimo prodotto per pelle secca',
    minLength: 5,
    maxLength: 100 
  })
  @IsString()
  @Length(5, 100)
  title: string;

  @ApiProperty({ 
    description: 'Commento dettagliato',
    example: 'Ho utilizzato questa crema per 3 settimane e i risultati sono eccellenti. La mia pelle è molto più morbida e idratata.',
    minLength: 20,
    maxLength: 2000 
  })
  @IsString()
  @Length(20, 2000)
  comment: string;

  @ApiPropertyOptional({ 
    description: 'Array di URL immagini allegate alla recensione',
    type: [String],
    example: ['https://example.com/review-photo1.jpg', 'https://example.com/review-photo2.jpg']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  @ArrayMaxSize(5)
  images?: string[];

  @ApiPropertyOptional({ 
    description: 'ID dell\'ordine associato (per verificare acquisto)',
    example: 'uuid-order-456' 
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  orderId?: string;
}