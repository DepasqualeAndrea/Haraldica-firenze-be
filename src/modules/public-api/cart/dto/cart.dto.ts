import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsArray, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

export class AddToCartDto {
  @ApiProperty({ description: 'ID della ProductVariant (colore)' })
  @IsUUID()
  variantId: string;

  @ApiProperty({ description: 'Taglia selezionata. Es: "M", "L", "XL"' })
  @IsString()
  size: string;

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
  @Expose() colorName: string;
  @Expose() colorHex: string;

  /**
   * Stock per taglia { "XS": 3, "S": 5, "M": 8, "L": 10, "XL": 0, "XXL": 2 }.
   * Il FE usa questo insieme alla `size` del CartItem per mostrare la disponibilità.
   */
  @Expose() stockPerSize: Record<string, number>;

  @Expose() effectivePrice: number;
  @Expose() images?: string[];

  // Dati del prodotto padre (flattened per comodità FE)
  @Expose() productId: string;
  @Expose() productName: string;
  @Expose() productSlug?: string;
  @Expose() productMaterials: string;
  @Expose() productOrigin: string;
  @Expose() productIsActive: boolean;
  @Expose() productVendor?: string;
  @Expose() productDescription?: string;
}

export class CartItemDto {
  @Expose() id: string;
  @Expose() variantId: string;

  /**
   * Taglia selezionata dall'utente per questo articolo.
   * Es: "M", "L", "XL"
   */
  @ApiProperty({ example: 'M' }) @Expose()
  size: string;

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

  /** Stock disponibile per la taglia selezionata */
  private get _sizeStock(): number {
    return (this.variant?.stockPerSize ?? {})[this.size] ?? 0;
  }

  @ApiProperty() @Expose()
  get isAvailable(): boolean { return this._sizeStock >= this.quantity; }

  @ApiProperty() @Expose()
  get maxQuantityAvailable(): number { return this._sizeStock; }

  /** Composed title: "Product Name - Size". Example: "Mackintosh Goggle Car Coat - L" */
  @ApiProperty() @Expose()
  get title(): string {
    const base = this.variant?.productName ?? '';
    return this.size ? `${base} - ${this.size}` : base;
  }

  /** Option values for this line item. Example: ["L"] */
  @ApiProperty({ type: [String] }) @Expose()
  get variant_options(): string[] {
    return this.size ? [this.size] : [];
  }

  /** Structured option breakdown. Example: [{ name: "Size", value: "L" }, { name: "Color", value: "Blu" }] */
  @ApiProperty({ type: [Object] }) @Expose()
  get options_with_values(): Array<{ name: string; value: string }> {
    const opts: Array<{ name: string; value: string }> = [];
    if (this.size) opts.push({ name: 'Size', value: this.size });
    if (this.variant?.colorName) opts.push({ name: 'Color', value: this.variant.colorName });
    return opts;
  }

  /** Product description forwarded to line-item level for cart display. */
  @ApiPropertyOptional() @Expose()
  get product_description(): string | undefined {
    return this.variant?.productDescription;
  }
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
