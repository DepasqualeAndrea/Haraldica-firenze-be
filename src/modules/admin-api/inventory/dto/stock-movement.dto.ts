import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsEnum, IsDateString, IsNumber, IsString, Max, Min } from 'class-validator';
import { InventoryMovementType } from 'src/database/entities/inventory-movement.entity';

export class StockMovementFilterDto {
  @ApiPropertyOptional({
    description: 'ID della variante da filtrare',
    example: '3b1b4b5a-5c25-4df8-8a9d-90e8b0c8fabc'
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({
    enum: InventoryMovementType,
    description: 'Tipo movimento da filtrare'
  })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  movementType?: InventoryMovementType;

  @ApiPropertyOptional({
    description: 'Data inizio periodo (ISO)',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Data fine periodo (ISO)',
    example: '2024-12-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'ID utente che ha effettuato il movimento',
    example: 'uuid-user-789'
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Numero lotto/batch',
    example: 'LOT202501A'
  })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({
    description: 'Numero ordine associato',
    example: 'MRV20250101001'
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Limite risultati (max 1000)',
    example: 100,
    default: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => (value ? parseInt(value) : 100))
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Offset per paginazione',
    example: 0,
    default: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? parseInt(value) : 0))
  offset?: number = 0;
}