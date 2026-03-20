import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNumber, Min, IsEnum, IsOptional, IsString, Length, IsDateString } from "class-validator";
import { InventoryMovementType } from "src/database/entities/inventory-movement.entity";

export class UpdateStockInventroryDto {
  @ApiProperty({
    description:
      'Quantità da aggiungere/sottrarre o valore assoluto per adjustment',
    example: 10,
  })
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  quantity: number;

  @ApiProperty({
    enum: InventoryMovementType,
    description: 'Tipo di movimento inventory',
  })
  @IsEnum(InventoryMovementType)
  movementType: InventoryMovementType;

  @ApiPropertyOptional({
    description: 'Costo unitario per calcolo valore inventario',
    example: 25.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Numero lotto/batch del prodotto',
    example: 'LOT202501A',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  batchNumber?: string;

  @ApiPropertyOptional({
    description: 'Data di scadenza del lotto',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: Date;

  @ApiPropertyOptional({
    description: 'Motivo del movimento',
    example: 'Arrivo nuovo stock dal fornitore XYZ',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Note aggiuntive',
    example: 'Controllato qualità - tutto OK',
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export interface UpdateStockDto {
  quantity: number;
  movementType: InventoryMovementType;
  reason: string;
  notes?: string;
  orderId?: string;
}