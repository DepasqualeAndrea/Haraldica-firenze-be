import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { ClothingCategory } from 'src/database/enums/clothing-category.enum';

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS (query params per catalogo pubblico)
// ─────────────────────────────────────────────────────────────────────────────

export class ProductFilterDto {
  @ApiPropertyOptional({ description: 'Ricerca full-text su nome, materiali, origine' })
  @IsOptional() @IsString()
  query?: string;

  @ApiPropertyOptional({ enum: ClothingCategory })
  @IsOptional() @IsEnum(ClothingCategory)
  clothingType?: ClothingCategory;

  @ApiPropertyOptional({ minimum: 0, description: 'Prezzo minimo (basePrice)' })
  @IsOptional() @IsNumber() @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsNumber() @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Taglia (es. M, IT42, 42)' })
  @IsOptional() @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Nome colore (case-insensitive, es. Bianco, Blu)' })
  @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Vestibilità (Slim, Regular, Oversize, Tailored)' })
  @IsOptional() @IsString()
  fit?: string;

  @ApiPropertyOptional({ description: 'Materiale (es. Cashmere, Seta, Pelle)' })
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

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsNumber() @Min(1) @Max(5)
  minRating?: number;
}

export class QuickSearchDto {
  @ApiProperty() @IsString() query: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional() @IsInt() @Min(1) @Max(50)
  limit?: number = 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSES
// ─────────────────────────────────────────────────────────────────────────────

export class PublicCategoryDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() slug: string;
  @Expose() clothingType?: string;
}

export class PublicVariantDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() sku: string;
  @ApiProperty() @Expose() size: string;
  @ApiProperty() @Expose() colorName: string;
  @ApiProperty() @Expose() colorHex: string;
  @ApiProperty() @Expose() availableStock: number;
  @ApiProperty() @Expose() effectivePrice: number;
  @ApiPropertyOptional({ type: [String] }) @Expose() images?: string[];
  @ApiProperty() @Expose() isActive: boolean;
}

export class PublicProductDto {
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
  @ApiProperty() @Expose() isFeatured: boolean;
  @ApiProperty() @Expose() isOnSale: boolean;
  @ApiProperty() @Expose() averageRating: number;
  @ApiProperty() @Expose() reviewCount: number;
  @ApiPropertyOptional() @Expose() metaTitle?: string;
  @ApiPropertyOptional() @Expose() metaDescription?: string;

  @ApiProperty({ type: PublicCategoryDto }) @Expose() @Type(() => PublicCategoryDto)
  category: PublicCategoryDto;

  @ApiProperty({ type: [PublicVariantDto] }) @Expose() @Type(() => PublicVariantDto)
  variants: PublicVariantDto[];

  @ApiProperty() @Expose() createdAt: Date;

  @ApiProperty() @Expose()
  get isInStock(): boolean { return this.variants?.some(v => v.isActive && v.availableStock > 0) ?? false; }

  @ApiProperty() @Expose()
  get mainImage(): string {
    for (const v of this.variants || []) {
      if (v.images?.length) return v.images[0];
    }
    return '/assets/images/placeholder-product.jpg';
  }

  @ApiProperty({ type: [String] }) @Expose()
  get availableSizes(): string[] {
    return [...new Set((this.variants || []).filter(v => v.isActive && v.availableStock > 0).map(v => v.size))];
  }

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

  @ApiProperty() @Expose()
  get isTrending(): boolean {
    const days = Math.floor((Date.now() - new Date(this.createdAt).getTime()) / 86_400_000);
    return days < 90 && this.averageRating > 4.0;
  }
}

export class PublicProductDetailDto extends PublicProductDto {
  @ApiPropertyOptional({ type: [PublicProductDto] }) @Expose() @Type(() => PublicProductDto)
  relatedProducts?: PublicProductDto[];
}

export class ProductListResponseDto {
  @ApiProperty({ type: [PublicProductDto] }) @Expose() @Type(() => PublicProductDto)
  products: PublicProductDto[];

  @ApiProperty() @Expose() total: number;
  @ApiProperty() @Expose() page: number;
  @ApiProperty() @Expose() limit: number;
  @ApiProperty() @Expose() totalPages: number;
  @ApiProperty() @Expose() hasNext: boolean;
  @ApiProperty() @Expose() hasPrev: boolean;
}

export class SearchSuggestionsResponseDto {
  @ApiProperty({ type: [String] }) @Expose() products: string[];
  @ApiProperty({ type: [String] }) @Expose() categories: string[];
  @ApiProperty({ type: [Object] }) @Expose() colors: Array<{ name: string; hex: string }>;
  @ApiProperty({ type: [String] }) @Expose() sizes: string[];
}

export class AvailableFiltersDto {
  @ApiProperty() @Expose() priceRange: { min: number; max: number };
  @ApiProperty({ type: [String] }) @Expose() sizes: string[];
  @ApiProperty({ type: [Object] }) @Expose() colors: Array<{ name: string; hex: string }>;
  @ApiProperty({ type: [String] }) @Expose() fits: string[];
  @ApiProperty({ type: [String] }) @Expose() materials: string[];
}
