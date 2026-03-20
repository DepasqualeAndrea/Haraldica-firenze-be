import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsArray, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

export class AddToCartDto {
  @ApiProperty({ description: 'ID della ProductVariant (taglia + colore specifico)' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ description: 'Quantità da aggiungere', minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

export class BulkAddToCartDto {
  @ApiProperty({ type: [AddToCartDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => AddToCartDto) @ArrayMinSize(1)
  items: AddToCartDto[];
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

export class ApplyCouponDto {
  @IsString()
  code: string;
}

export class CartBatchOperationDto {
  @ApiProperty({ enum: ['add', 'update', 'remove'] })
  operation: 'add' | 'update' | 'remove';

  @ApiProperty({ description: 'Cart item ID (per update/remove) oppure variantId (per add)' })
  @IsUUID()
  id: string;

  @ApiPropertyOptional() quantity?: number;
  @ApiPropertyOptional() notes?: string;
}

export class CartBatchUpdateDto {
  @ApiProperty({ type: [CartBatchOperationDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CartBatchOperationDto)
  operations: CartBatchOperationDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSES
// ─────────────────────────────────────────────────────────────────────────────

export class CartVariantDto {
  @Expose() id: string;
  @Expose() sku: string;
  @Expose() size: string;
  @Expose() colorName: string;
  @Expose() colorHex: string;
  @Expose() availableStock: number;
  @Expose() effectivePrice: number;
  @Expose() images?: string[];

  // Dati del prodotto padre
  @Expose() productId: string;
  @Expose() productName: string;
  @Expose() productSlug?: string;
  @Expose() productMaterials: string;
  @Expose() productOrigin: string;
  @Expose() productIsActive: boolean;
}

export class CartItemDto {
  @Expose() id: string;
  @Expose() variantId: string;
  @Expose() quantity: number;
  @Expose() notes?: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Expose() @Type(() => CartVariantDto)
  variant: CartVariantDto;

  /** Prezzo unitario bloccato al momento dell'aggiunta */
  @ApiProperty() @Expose()
  get unitPrice(): number { return Number(this['lockedPrice']) || this.variant?.effectivePrice || 0; }

  @ApiProperty() @Expose()
  get totalPrice(): number { return this.unitPrice * this.quantity; }

  @ApiProperty() @Expose()
  get isAvailable(): boolean { return this.variant?.availableStock >= this.quantity; }

  @ApiProperty() @Expose()
  get maxQuantityAvailable(): number { return this.variant?.availableStock ?? 0; }
}

export class CartTotalsDto {
  @ApiProperty() @Expose() subtotal: number;
  @ApiProperty() @Expose() totalDiscount: number;
  @ApiProperty() @Expose() total: number;
  @ApiProperty() @Expose() totalItems: number;
  @ApiProperty() @Expose() uniqueItems: number;
  @ApiProperty() @Expose() allItemsAvailable: boolean;
  @ApiProperty() @Expose() estimatedShipping: number;
  @ApiProperty() @Expose() grandTotal: number;
}

export class CartResponseDto {
  @Expose() id: string;

  @Expose() @Type(() => CartItemDto) @ValidateNested({ each: true })
  items: CartItemDto[];

  @Expose() @Type(() => CartTotalsDto)
  totals: CartTotalsDto;

  @ApiProperty() @Expose()
  get isEmpty(): boolean { return this.items.length === 0; }

  @ApiProperty() @Expose()
  get hasUnavailableItems(): boolean { return this.items.some(i => !i.isAvailable); }

  @ApiProperty() @Expose()
  get canProceedToCheckout(): boolean { return !this.isEmpty && !this.hasUnavailableItems; }
}

export class CartOperationResponseDto {
  @ApiProperty() @Expose() success: boolean;
  @ApiProperty() @Expose() message: string;
  @ApiProperty({ type: CartResponseDto }) @Expose() @Type(() => CartResponseDto) cart: CartResponseDto;
  @ApiPropertyOptional({ type: [String] }) @Expose() warnings?: string[];
  @ApiPropertyOptional({ type: [String] }) @Expose() errors?: string[];
}
