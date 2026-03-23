import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsNumber, IsObject,
  IsOptional, IsString, IsUUID, IsUrl, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { ClothingCategory } from 'src/database/enums/clothing-category.enum';

// ─────────────────────────────────────────────────────────────────────────────
// NESTED JSONB VALIDATOR CLASSES
// ─────────────────────────────────────────────────────────────────────────────

export class ProductDetailsDto {
  @ApiPropertyOptional({ example: 'Handmade in Scotland' })
  @IsOptional() @IsString()
  made_in?: string;

  @ApiPropertyOptional({ type: [String], example: ['Waterproof', 'Hand taped seams'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  attributes?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Adjustable Goggle hood', 'Raglan sleeves'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  detailing?: string[];

  @ApiPropertyOptional({ example: 'RO6604' })
  @IsOptional() @IsString()
  item_code?: string;
}

export class SizeFitModelDto {
  @ApiPropertyOptional({ example: 'Timmy' })
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 189 })
  @IsOptional() @IsNumber()
  height_cm?: number;

  @ApiPropertyOptional({ example: 89 })
  @IsOptional() @IsNumber()
  chest_cm?: number;

  @ApiPropertyOptional({ example: 71 })
  @IsOptional() @IsNumber()
  waist_cm?: number;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional() @IsString()
  wearing_size?: string;
}

export class SizeFitMeasurementDto {
  @ApiProperty({ example: 'Chest' })
  @IsString()
  label: string;

  @ApiProperty({ example: { XS: 96, S: 100, M: 104, L: 108 }, description: 'Measurement values keyed by size' })
  @IsObject()
  values: Record<string, number>;
}

export class ProductSizeFitDto {
  @ApiPropertyOptional({ example: 'Regular' })
  @IsOptional() @IsString()
  fit_type?: string;

  @ApiPropertyOptional({ example: 'Fits large, size down' })
  @IsOptional() @IsString()
  advice?: string;

  @ApiPropertyOptional({ type: SizeFitModelDto })
  @IsOptional() @ValidateNested() @Type(() => SizeFitModelDto)
  model?: SizeFitModelDto;

  @ApiPropertyOptional({ type: [SizeFitMeasurementDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SizeFitMeasurementDto)
  measurements?: SizeFitMeasurementDto[];
}

export class ProductFabricCareDto {
  @ApiPropertyOptional({ example: '100% Cotton Bonded' })
  @IsOptional() @IsString()
  composition?: string;

  @ApiPropertyOptional({ example: 'Spot clean only. Do not machine wash.' })
  @IsOptional() @IsString()
  washing?: string;

  @ApiPropertyOptional({ example: 'Small marks can be removed with soap and cold water.' })
  @IsOptional() @IsString()
  day_to_day?: string;
}

export class ProductShippingReturnsDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  shipping_text?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  returns_text?: string;
}

export class SignatureDetailDto {
  @ApiProperty({ example: 'Hand-stitched buttonholes' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ example: 'Ogni asola è rifinita a mano da maestri sarti fiorentini' })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ type: [String], example: ['https://.../asola-1.webp', 'https://.../asola-2.webp'] })
  @IsArray() @IsUrl({}, { each: true })
  images: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE VARIANT  (deve stare prima di CreateProductDto)
// ─────────────────────────────────────────────────────────────────────────────

export class CreateVariantDto {
  /**
   * UUID della variante esistente.
   * Presente solo negli update: se valorizzato il backend aggiorna la variante,
   * se assente ne crea una nuova.
   */
  @ApiPropertyOptional({ example: '70460079-95ed-4955-9a9e-7000f78de712' })
  @IsOptional() @IsUUID()
  id?: string;

  @ApiProperty({ example: 'ABITO-NAVY', description: 'SKU univoco per colore. Solo maiuscolo, numeri, trattini.' })
  @IsString()
  @Matches(/^[A-Z0-9\-]+$/, { message: 'SKU deve contenere solo lettere maiuscole, numeri e trattini (no spazi)' })
  sku: string;

  @ApiProperty({ example: 'Blu Navy' })
  @IsString() @Length(2, 60)
  colorName: string;

  @ApiProperty({ example: '#020610', description: 'Codice HEX con # iniziale' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorHex deve essere un codice HEX valido (es. #020610)' })
  colorHex: string;

  /**
   * Stock per ogni taglia. Le chiavi devono corrispondere a product.sizes.
   * Es: { "XS": 3, "S": 5, "M": 8, "L": 10, "XL": 0, "XXL": 2 }
   * Taglie omesse vengono trattate come stock 0.
   */
  @ApiProperty({
    example: { XS: 3, S: 5, M: 8, L: 10, XL: 0, XXL: 2 },
    description: 'Stock per taglia. Chiavi = taglie del prodotto, valori = quantità disponibili.',
  })
  @IsObject()
  stockPerSize: Record<string, number>;

  @ApiPropertyOptional({ example: 620.00, minimum: 0, description: 'Prezzo speciale (null = usa basePrice prodotto)' })
  @IsOptional() @IsNumber() @Min(0)
  variantPriceOverride?: number;

  @ApiPropertyOptional({ type: [String], example: ['https://....supabase.co/storage/v1/object/public/...'] })
  @IsOptional() @IsArray() @IsUrl({}, { each: true })
  images?: string[];

  /**
   * Ordine di visualizzazione nel selettore colori (0 = primo).
   * Default: 0. Manda 0, 1, 2, ... per controllare l'ordine.
   */
  @ApiPropertyOptional({ example: 0, default: 0, minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  /**
   * Variante mostrata per default all'apertura della scheda prodotto.
   * Solo una variante per prodotto dovrebbe essere true.
   */
  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '5060487682670' })
  @IsOptional() @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 1.2, minimum: 0 })
  @IsOptional() @IsNumber() @Min(0)
  weight?: number;

  @ApiPropertyOptional({ enum: ['kg', 'g'], default: 'kg' })
  @IsOptional() @IsEnum(['kg', 'g'])
  weightUnit?: string;

  @ApiPropertyOptional({ type: [SignatureDetailDto], description: 'Dettagli di qualità specifici per questo colore' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SignatureDetailDto)
  signatureDetails?: SignatureDetailDto[];
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

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

  // ── Full-Spec luxury fields ────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'Mackintosh x C.P. Company' })
  @IsOptional() @IsString()
  vendor?: string;

  @ApiPropertyOptional({ example: 'Coat' })
  @IsOptional() @IsString()
  productType?: string;

  @ApiPropertyOptional({ enum: ['GBP', 'EUR', 'USD'], default: 'EUR' })
  @IsOptional() @IsEnum(['GBP', 'EUR', 'USD'])
  currency?: string;

  @ApiPropertyOptional({ type: [String], example: ['outerwear', 'waterproof', 'sale'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '2025-09-01T00:00:00.000Z', description: 'ISO 8601 publish datetime' })
  @IsOptional() @IsISO8601()
  publishedAt?: string;

  @ApiPropertyOptional({ description: 'HTML description. Coexists with plain-text description.' })
  @IsOptional() @IsString()
  descriptionHtml?: string;

  @ApiPropertyOptional({ type: ProductDetailsDto, description: 'Details tab: provenance, attributes, detailing' })
  @IsOptional() @ValidateNested() @Type(() => ProductDetailsDto)
  details?: ProductDetailsDto;

  @ApiPropertyOptional({ type: ProductSizeFitDto, description: 'Size & Fit tab: model info and measurements table' })
  @IsOptional() @ValidateNested() @Type(() => ProductSizeFitDto)
  sizeFit?: ProductSizeFitDto;

  @ApiPropertyOptional({ type: ProductFabricCareDto, description: 'Fabric & Care tab' })
  @IsOptional() @ValidateNested() @Type(() => ProductFabricCareDto)
  fabricCare?: ProductFabricCareDto;

  @ApiPropertyOptional({ type: ProductShippingReturnsDto, description: 'Shipping & Returns tab' })
  @IsOptional() @ValidateNested() @Type(() => ProductShippingReturnsDto)
  shippingReturns?: ProductShippingReturnsDto;

  // ── Taglie ────────────────────────────────────────────────────────────────

  /**
   * Range completo di taglie del prodotto (es. ["XS","S","M","L","XL","XXL"]).
   * Definisce TUTTE le taglie in cui esiste il modello,
   * indipendentemente dallo stock delle singole varianti.
   */
  @ApiPropertyOptional({ type: [String], example: ['XS','S','M','L','XL','XXL'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  sizes?: string[];

  /**
   * IGNORATA in scrittura: il backend non persiste immagini a livello prodotto.
   * Le immagini vivono sulle varianti. Accettata solo per compatibilità FE legacy.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  images?: string[];

  /**
   * mainImage è IGNORATA in scrittura: viene calcolata automaticamente
   * dalla variante default (o dalla prima variante per sortOrder).
   * Accettata nel payload solo per compatibilità FE, non persiste sul DB.
   */
  @ApiPropertyOptional({ example: 'https://....supabase.co/...webp' })
  @IsOptional() @IsString()
  mainImage?: string;

  // ── Varianti inline ───────────────────────────────────────────────────────

  /**
   * Varianti da creare contestualmente al prodotto.
   * Se omesso, le varianti vanno create separatamente via POST /variants.
   */
  @ApiPropertyOptional({ type: [SignatureDetailDto], description: 'Dettagli di qualità/manifattura (asole a mano, bottoni madreperla, ecc.)' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SignatureDetailDto)
  signatureDetails?: SignatureDetailDto[];

  @ApiPropertyOptional({ type: [CreateVariantDto], description: 'Varianti da creare insieme al prodotto' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
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

  /**
   * Override esplicito: PartialType non garantisce la copia di @Type(() => CreateVariantDto).
   * Senza questo, il global ValidationPipe non istanzia le varianti come CreateVariantDto
   * e tutti i campi (incluso stockPerSize) vengono rifiutati come "non whitelisted".
   */
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}


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
  @ApiProperty() @Expose() colorName: string;
  @ApiProperty() @Expose() colorHex: string;

  /**
   * Stock per taglia. Es: { "XS": 3, "S": 5, "M": 8, "L": 10, "XL": 0, "XXL": 2 }
   * Taglia assente o a 0 = esaurita.
   */
  @ApiProperty({ example: { XS: 3, S: 5, M: 8, L: 10, XL: 0, XXL: 2 } })
  @Expose() stockPerSize: Record<string, number>;

  /** Stock totale (somma di tutte le taglie) */
  @ApiProperty() @Expose() totalStock: number;

  /** Taglie con stock > 0 */
  @ApiProperty({ type: [String] }) @Expose() availableSizes: string[];

  @ApiPropertyOptional() @Expose() variantPriceOverride?: number;
  @ApiProperty() @Expose() effectivePrice: number;
  @ApiPropertyOptional({ type: [String] }) @Expose() images?: string[];
  @ApiPropertyOptional({ type: [SignatureDetailDto] }) @Expose() signatureDetails?: SignatureDetailDto[];
  @ApiProperty({ example: 0 }) @Expose() sortOrder: number;
  @ApiProperty({ example: false }) @Expose() isDefault: boolean;
  @ApiProperty() @Expose() isActive: boolean;
  @ApiPropertyOptional() @Expose() barcode?: string;
  @ApiPropertyOptional() @Expose() weight?: number;
  @ApiPropertyOptional() @Expose() weightUnit?: string;
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
  @ApiPropertyOptional() @Expose() vendor?: string;
  @ApiPropertyOptional() @Expose() productType?: string;
  @ApiPropertyOptional() @Expose() currency?: string;
  @ApiPropertyOptional({ type: [String] }) @Expose() tags?: string[];
  @ApiPropertyOptional() @Expose() publishedAt?: Date;
  @ApiPropertyOptional() @Expose() descriptionHtml?: string;
  @ApiPropertyOptional({ type: [String] }) @Expose() sizes?: string[];
  @ApiPropertyOptional({ type: [SignatureDetailDto] }) @Expose() signatureDetails?: SignatureDetailDto[];

  @ApiProperty() @Expose()
  get handle(): string { return (this as any).slug; }

  @ApiPropertyOptional({ type: ProductDetailsDto }) @Expose() details?: ProductDetailsDto;
  @ApiPropertyOptional({ type: ProductSizeFitDto }) @Expose() sizeFit?: ProductSizeFitDto;
  @ApiPropertyOptional({ type: ProductFabricCareDto }) @Expose() fabricCare?: ProductFabricCareDto;
  @ApiPropertyOptional({ type: ProductShippingReturnsDto }) @Expose() shippingReturns?: ProductShippingReturnsDto;

  @ApiProperty({ type: CategoryResponseDto }) @Expose() @Type(() => CategoryResponseDto)
  category: CategoryResponseDto;

  @ApiProperty({ type: [VariantResponseDto] }) @Expose() @Type(() => VariantResponseDto)
  variants: VariantResponseDto[];

  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;

  @ApiProperty() @Expose()
  get isInStock(): boolean {
    return this.variants?.some(v => v.isActive && v.totalStock > 0) ?? false;
  }

  @ApiProperty() @Expose()
  get popularityScore(): number {
    return this.salesCount * 0.7 + (this.averageRating * this.reviewCount) * 0.3;
  }

  @ApiProperty() @Expose()
  get isTrending(): boolean {
    const days = Math.floor((Date.now() - new Date(this.createdAt).getTime()) / 86_400_000);
    return days < 90 && this.salesCount > 50 && this.averageRating > 4.0;
  }

  /**
   * Immagine principale del prodotto.
   * Priorità: 1) variante con isDefault=true  2) variante con sortOrder più basso  3) placeholder
   */
  @ApiProperty() @Expose()
  get mainImage(): string {
    const sorted = [...(this.variants || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const def = sorted.find(v => v.isDefault) ?? sorted[0];
    return def?.images?.[0] ?? '/assets/images/placeholder-product.jpg';
  }

  /**
   * Taglie con stock disponibile (aggregato da tutte le varianti attive).
   * Rispetta l'ordine di `sizes` se definito sul prodotto.
   */
  @ApiProperty({ type: [String] }) @Expose()
  get availableSizes(): string[] {
    const sizesWithStock = new Set<string>();
    for (const v of this.variants || []) {
      if (!v.isActive) continue;
      for (const [size, qty] of Object.entries(v.stockPerSize || {})) {
        if (qty > 0) sizesWithStock.add(size);
      }
    }
    // Rispetta l'ordine canonico di product.sizes se disponibile
    const orderedSizes: string[] = (this as any).sizes ?? [];
    if (orderedSizes.length) {
      return orderedSizes.filter(s => sizesWithStock.has(s));
    }
    return [...sizesWithStock];
  }

  /**
   * Colori disponibili con dettaglio stock per taglia.
   */
  @ApiProperty() @Expose()
  get availableColors(): Array<{
    name: string;
    hex: string;
    images: string[];
    stockPerSize: Record<string, number>;
    availableSizes: string[];
    signatureDetails?: SignatureDetailDto[];
  }> {
    return (this.variants || [])
      .filter(v => v.isActive)
      .map(v => ({
        name: v.colorName,
        hex: v.colorHex,
        images: v.images ?? [],
        stockPerSize: v.stockPerSize ?? {},
        availableSizes: Object.entries(v.stockPerSize ?? {})
          .filter(([, qty]) => qty > 0)
          .map(([size]) => size),
        signatureDetails: v.signatureDetails,
      }));
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
