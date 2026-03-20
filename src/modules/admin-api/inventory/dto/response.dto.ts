import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { InventoryMovementType } from "src/database/entities/inventory-movement.entity";

export class InventoryMovementResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() productId: string;
  @ApiProperty({ enum: InventoryMovementType }) @Expose() movementType: InventoryMovementType;

  @ApiProperty() @Expose() quantity: number;
  @ApiProperty() @Expose() quantityBefore: number;
  @ApiProperty() @Expose() quantityAfter: number;

  @ApiPropertyOptional() @Expose() unitCost?: number;
  @ApiPropertyOptional() @Expose() orderId?: string;
  @ApiPropertyOptional() @Expose() batchNumber?: string;
  @ApiPropertyOptional() @Expose() expiryDate?: Date;
  @ApiPropertyOptional() @Expose() userId?: string;
  @ApiPropertyOptional() @Expose() reason?: string;
  @ApiPropertyOptional() @Expose() notes?: string;

  @ApiProperty() @Expose() createdAt: Date;

  @ApiPropertyOptional() @Expose() product?: {
    id: string;
    sku?: string;
    name: string;
    brand?: string;
  };

  @ApiPropertyOptional() @Expose() user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export class InventoryStatsResponseDto {
  @ApiProperty() @Expose() totalMovements: number;
  @ApiProperty() @Expose() inMovements: number;
  @ApiProperty() @Expose() outMovements: number;
  @ApiProperty() @Expose() adjustments: number;
  @ApiProperty() @Expose() totalInventoryValue: number;
  @ApiProperty() @Expose() movementsByType: { [key: string]: number };

  @ApiProperty({ type: [InventoryMovementResponseDto] })
  @Expose()
  @Type(() => InventoryMovementResponseDto)
  recentMovements: InventoryMovementResponseDto[];

  @ApiProperty({
    type: () => [Object],
    description: 'Top prodotti per valore di magazzino'
  })
  @Expose()
  topValueProducts: Array<{
    productId: string;
    productName: string;
    value: number;
    stock: number;
    unitCost?: number;
  }>;
}

export class BulkUpdateResultDto {
  @ApiProperty() @Expose() successful: number;
  @ApiProperty() @Expose() failed: number;
  @ApiProperty({ type: [String] }) @Expose() errors: string[];
  @ApiProperty({ type: [String] }) @Expose() warnings: string[];
  @ApiProperty() @Expose() totalProcessed: number;
  @ApiProperty() @Expose() completedAt: Date;
}

export class LowStockResponseDto {
  @ApiProperty() @Expose() productId: string;
  @ApiProperty() @Expose() productName: string;
  @ApiProperty() @Expose() sku: string;
  @ApiProperty() @Expose() currentStock: number;
  @ApiProperty() @Expose() threshold: number;
  @ApiProperty() @Expose() stockDifference: number;

  @ApiPropertyOptional() @Expose() brand?: string;
  @ApiPropertyOptional() @Expose() category?: string;

  @ApiPropertyOptional() @Expose() lastMovement?: {
    date: Date;
    type: InventoryMovementType;
    quantity: number;
  };
}