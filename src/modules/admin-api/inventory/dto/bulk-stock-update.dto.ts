import { IsArray, ValidateNested, IsNumber, IsOptional, IsString, ArrayMaxSize, ArrayMinSize, IsDateString, Length, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkStockItemDto {
  @ApiProperty({
    description: 'ID del prodotto da aggiornare',
    example: '3b1b4b5a-5c25-4df8-8a9d-90e8b0c8fabc'
  })
  @IsString()
  productId: string;

  @ApiProperty({
    description: 'Nuovo valore di stock da impostare',
    example: 50
  })
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  newStock: number;

  @ApiPropertyOptional({
    description: 'Costo unitario per questo aggiornamento',
    example: 25.50
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => (value !== undefined && value !== null ? parseFloat(value) : undefined))
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Motivo specifico per questo prodotto',
    example: 'Inventario fisico mensile'
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Numero lotto',
    example: 'LOT202501B'
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  batchNumber?: string;

  @ApiPropertyOptional({
    description: 'Data scadenza (se applicabile)',
    example: '2026-06-30'
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: Date;
}

export class BulkStockUpdateDto {
  @ApiProperty({
    type: [BulkStockItemDto],
    description: 'Lista dei prodotti da aggiornare'
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkStockItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500) // Limite per performance
  items: BulkStockItemDto[];

  @ApiPropertyOptional({
    description: "Motivo generale per l'aggiornamento",
    example: 'Inventario fisico di fine mese'
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  globalReason?: string;

  @ApiPropertyOptional({
    description: 'Note generali',
    example: 'Verificato da team warehouse'
  })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}