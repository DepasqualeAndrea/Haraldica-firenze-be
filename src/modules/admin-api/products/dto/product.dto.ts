import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, IsUrl, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { ClothingCategory } from 'src/database/enums/clothing-category.enum';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE PRODUCT
// ─────────────────────────────────────────────────────────────────────────────

export class CreateProductDto {
  @ApiProperty({ example: 'Camicia in Seta di Firenze' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional({ example: 'camicia-seta-firenze' })
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug deve contenere solo lettere minuscole, numeri e trattini' })
  slug?: string;

  @ApiProperty({ example: 550.00, minimum: 0 })
  @IsNumber() @Min(0)
  basePrice: number;

  @ApiProperty({ example: 'Tessuto dall\'anima della Toscana...' })
  @IsString() @Length(10, 5000)
  description: string;

  @ApiProperty({ example: '100% Seta di Como' })
  @IsString() @IsNotEmpty()
  materials: string;

  @ApiPropertyOptional({ example: 'Slim', description: 'Slim | Regular | Oversize | Tailored' })
  @IsOptional() @IsString()
  fit?: string;

  @ApiProperty({ example: 'Handmade in Tuscany, Italy' })
  @IsString() @IsNotEmpty()
  origin: string;

  @ApiPropertyOptional({ example: 'Lavaggio a secco. Non stirare.' })
  @IsOptional() @IsString()
  careInstructions?: string;

  @ApiPropertyOptional({ example: 'Capsule Collection AW2025' })
  @IsOptional() @IsString()
  productLine?: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isOnSale?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  stripeProductId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @Length(1, 100)
  metaTitle?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional() @IsString() @Length(1, 300)
  metaDescription?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional() @IsNumber() @Min(0) @Max(5)
  averageRating?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber() @Min(0)
  reviewCount?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber() @Min(0)
  salesCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE VARIANT
// ─────────────────────────────────────────────────────────────────────────────

export class CreateVariantDto {
  @ApiProperty({ example: 'CAM-SET-BIA-IT42', description: 'SKU univoco: solo maiuscolo, numeri, trattini' })
  @IsString()
  @Matches(/^[A-Z0-9\-]+$/, { message: 'SKU deve contenere solo lettere maiuscole, numeri e trattini' })
  sku: string;

  @ApiProperty({ example: 'IT42', description: 'Taglia: S, M, L, IT42, IT44, 42 (scarpe)' })
  @IsString() @Length(1, 10)
  size: string;

  @ApiProperty({ example: 'Bianco Perla' })
  @IsString() @Length(2, 60)
  colorName: string;

  @ApiProperty({ example: '#F5F0E8', description: 'Codice HEX con # iniziale' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorHex deve essere un codice HEX valido (es. #F5F0E8)' })
  colorHex: string;

  @ApiProperty({ example: 3, minimum: 0 })
  @IsInt() @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: 620.00, minimum: 0, description: 'Prezzo speciale per questa variante (null = usa basePrice del prodotto)' })
  @IsOptional() @IsNumber() @Min(0)
  variantPriceOverride?: number;

  @ApiPropertyOptional({ type: [String], example: ['https://....supabase.co/storage/v1/object/public/...'] })
  @IsOptional() @IsArray() @IsUrl({}, { each: true })
  images?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class UpdateVariantStockDto {
  @ApiProperty({ minimum: 0 })
  @IsInt() @Min(0)
  quantity: number;

  @ApiPropertyOptional({ enum: ['set', 'add', 'subtract'] })
  @IsOptional() @IsString()
  operation?: 'set' | 'add' | 'subtract' = 'set';

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────────────────────

export class ProductFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() query?: string;

  @ApiPropertyOptional({ enum: ClothingCategory })
  @IsOptional() @IsEnum(ClothingCategory)
  clothingType?: ClothingCategory;

  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0) minPrice?: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0) maxPrice?: number;

  @ApiPropertyOptional({ description: 'Filtra per taglia (es. M, IT42)' })
  @IsOptional() @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Filtra per nome colore (case-insensitive)' })
  @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Filtra per vestibilità (es. Slim, Regular)' })
  @IsOptional() @IsString()
  fit?: string;

  @ApiPropertyOptional({ description: 'Filtra per materiale (es. Cashmere, Seta)' })
  @IsOptional() @IsString()
  materials?: string;

  @ApiPropertyOptional({ enum: ['basePrice', 'rating', 'sales', 'newest', 'name'] })
  @IsOptional() @IsEnum(['basePrice', 'rating', 'sales', 'newest', 'name'])
  sortBy?: 'basePrice' | 'rating' | 'sales' | 'newest' | 'name';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional() @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number = 20;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() inStockOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onSaleOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featuredOnly?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @IsNumber() @Min(1) @Max(5) minRating?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  excludeIds?: string[];
}

export class AdminProductFilterDto extends ProductFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ description: 'Varianti con stock basso' })
  @IsOptional() @IsBoolean() lowStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() createdAfter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBefore?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() updatedAfter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() updatedBefore?: string;
}

export class QuickSearchDto {
  @ApiProperty() @IsString() query: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional() @IsInt() @Min(1) @Max(50)
  limit?: number = 10;
}

export class BulkUpdateProductsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('4', { each: true }) productIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOnSale?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSES
// ─────────────────────────────────────────────────────────────────────────────

export class CategoryResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() name: string;
  @ApiProperty() @Expose() slug: string;
  @ApiPropertyOptional() @Expose() clothingType?: string;
}

export class VariantResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() sku: string;
  @ApiProperty() @Expose() size: string;
  @ApiProperty() @Expose() colorName: string;
  @ApiProperty() @Expose() colorHex: string;
  @ApiProperty() @Expose() stock: number;
  @ApiProperty() @Expose() reservedStock: number;
  @ApiProperty() @Expose() availableStock: number;
  @ApiPropertyOptional() @Expose() variantPriceOverride?: number;
  @ApiProperty() @Expose() effectivePrice: number;
  @ApiPropertyOptional({ type: [String] }) @Expose() images?: string[];
  @ApiProperty() @Expose() isActive: boolean;
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;
}

export class ProductResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() name: string;
  @ApiPropertyOptional() @Expose() slug?: string;
  @ApiProperty() @Expose() description: string;
  @ApiProperty() @Expose() basePrice: number;
  @ApiProperty() @Expose() materials: string;
  @ApiPropertyOptional() @Expose() fit?: string;
  @ApiProperty() @Expose() origin: string;
  @ApiPropertyOptional() @Expose() careInstructions?: string;
  @ApiPropertyOptional() @Expose() productLine?: string;
  @ApiProperty() @Expose() isActive: boolean;
  @ApiProperty() @Expose() isFeatured: boolean;
  @ApiProperty() @Expose() isOnSale: boolean;
  @ApiPropertyOptional() @Expose() stripeProductId?: string;
  @ApiProperty() @Expose() averageRating: number;
  @ApiProperty() @Expose() reviewCount: number;
  @ApiProperty() @Expose() salesCount: number;
  @ApiPropertyOptional() @Expose() metaTitle?: string;
  @ApiPropertyOptional() @Expose() metaDescription?: string;

  @ApiProperty({ type: CategoryResponseDto }) @Expose() @Type(() => CategoryResponseDto)
  category: CategoryResponseDto;

  @ApiProperty({ type: [VariantResponseDto] }) @Expose() @Type(() => VariantResponseDto)
  variants: VariantResponseDto[];

  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;

  @ApiProperty() @Expose()
  get isInStock(): boolean { return this.variants?.some(v => v.availableStock > 0) ?? false; }

  @ApiProperty() @Expose()
  get popularityScore(): number {
    return this.salesCount * 0.7 + (this.averageRating * this.reviewCount) * 0.3;
  }

  @ApiProperty() @Expose()
  get isTrending(): boolean {
    const days = Math.floor((Date.now() - new Date(this.createdAt).getTime()) / 86_400_000);
    return days < 90 && this.salesCount > 50 && this.averageRating > 4.0;
  }

  /** Prima immagine disponibile tra le varianti */
  @ApiProperty() @Expose()
  get mainImage(): string {
    for (const v of this.variants || []) {
      if (v.images?.length) return v.images[0];
    }
    return '/assets/images/placeholder-product.jpg';
  }

  /** Taglie disponibili (solo varianti active con stock > 0) */
  @ApiProperty({ type: [String] }) @Expose()
  get availableSizes(): string[] {
    return [...new Set((this.variants || []).filter(v => v.isActive && v.availableStock > 0).map(v => v.size))];
  }

  /** Colori disponibili (distinct) */
  @ApiProperty() @Expose()
  get availableColors(): Array<{ name: string; hex: string }> {
    const seen = new Set<string>();
    const colors: Array<{ name: string; hex: string }> = [];
    for (const v of this.variants || []) {
      if (!seen.has(v.colorName) && v.isActive) {
        seen.add(v.colorName);
        colors.push({ name: v.colorName, hex: v.colorHex });
      }
    }
    return colors;
  }
}

export class AdminProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] }) @Expose() @Type(() => ProductResponseDto)
  products: ProductResponseDto[];

  @ApiProperty() @Expose() total: number;
  @ApiProperty() @Expose() page: number;
  @ApiProperty() @Expose() limit: number;
  @ApiProperty() @Expose() totalPages: number;
  @ApiProperty() @Expose() hasNext: boolean;
  @ApiProperty() @Expose() hasPrev: boolean;
}

export class ProductStatsResponseDto {
  @ApiProperty() @Expose() totalProducts: number;
  @ApiProperty() @Expose() activeProducts: number;
  @ApiProperty() @Expose() featuredProducts: number;
  @ApiProperty() @Expose() onSaleProducts: number;
  @ApiProperty() @Expose() totalVariants: number;
  @ApiProperty() @Expose() lowStockVariants: number;
  @ApiProperty() @Expose() outOfStockVariants: number;
  @ApiProperty() @Expose() averageBasePrice: number;
  @ApiProperty() @Expose() topCategories: Array<{ categoryId: string; categoryName: string; productCount: number }>;
  @ApiProperty() @Expose() generatedAt: Date;
}
