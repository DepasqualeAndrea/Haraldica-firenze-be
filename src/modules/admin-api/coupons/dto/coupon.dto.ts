import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength, ArrayMinSize } from 'class-validator';
import { CouponStatus, CouponType } from 'src/database/entities/coupon.entity';

// ========== CREATE ==========
export class CreateCouponDto {
  @ApiProperty({ description: 'Codice coupon univoco (es. SUMMER20, ZANO10)', example: 'SUMMER20' })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.toUpperCase().trim())
  code: string;

  @ApiProperty({ description: 'Nome descrittivo del coupon', example: 'Sconto Estate 2026' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descrizione dettagliata', example: 'Valido su tutti i prodotti estivi' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CouponType, description: 'Tipo di sconto' })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({ description: 'Valore sconto (percentuale o importo fisso)', example: 20, minimum: 0 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: 'Importo minimo ordine per applicare il coupon', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Sconto massimo applicabile (per coupon percentuali)', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumDiscountAmount?: number;

  @ApiPropertyOptional({ description: 'Limite utilizzi totali', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: 'Limite utilizzi per singolo utente', default: 1, example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimitPerUser?: number;

  @ApiPropertyOptional({ description: 'Data inizio validità', example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  @Transform(({ value }) => new Date(value).toISOString())
  startDate?: string;

  @ApiProperty({ description: 'Data fine validità', example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  @Type(() => Date)
  @Transform(({ value }) => new Date(value).toISOString())
  endDate: string;

  @ApiPropertyOptional({ description: 'ID prodotti su cui il coupon è applicabile' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProducts?: string[];

  @ApiPropertyOptional({ description: 'ID categorie su cui il coupon è applicabile' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];

  @ApiPropertyOptional({ description: 'ID prodotti esclusi' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedProducts?: string[];

  @ApiPropertyOptional({ description: 'ID categorie escluse' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedCategories?: string[];

  @ApiPropertyOptional({ description: 'Solo per primo ordine', default: false })
  @IsOptional()
  @IsBoolean()
  isFirstOrderOnly?: boolean;

  @ApiPropertyOptional({ description: 'Nome collaboratore/influencer a cui è assegnato', example: 'Marco Rossi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collaborator?: string;

  @ApiPropertyOptional({ description: 'Note interne (non visibili agli utenti)', example: 'Campagna Instagram Gennaio' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ enum: CouponStatus, description: 'Stato iniziale del coupon', default: CouponStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
}

// ========== UPDATE ==========
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

// ========== BULK CREATE ==========
export class BulkCreateCouponsDto {
  @ApiProperty({ type: [CreateCouponDto], description: 'Array di coupon da creare' })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => CreateCouponDto)
  coupons: CreateCouponDto[];
}

// ========== BULK DELETE ==========
export class BulkDeleteCouponsDto {
  @ApiProperty({ description: 'Array di ID coupon da eliminare', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(4, { each: true })
  ids: string[];
}

// ========== FILTER ==========
export class CouponFilterDto {
  @ApiPropertyOptional({ enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @ApiPropertyOptional({ description: 'Solo coupon attualmente validi' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  activeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filtra per collaboratore/influencer' })
  @IsOptional()
  @IsString()
  collaborator?: string;

  @ApiPropertyOptional({ description: 'Cerca per codice (partial match)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Pagina', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementi per pagina', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Ordinamento: createdAt, code, usedCount, validUntil', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Direzione: ASC o DESC', default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

// ========== VALIDATE ==========
export class ValidateCouponDto {
  @ApiProperty({ description: 'Codice coupon da validare' })
  @IsString()
  @Transform(({ value }) => value?.toUpperCase().trim())
  code: string;

  @ApiPropertyOptional({ description: 'Totale ordine per verificare minimum amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  orderTotal?: number;

  @ApiPropertyOptional({ description: 'ID prodotti nel carrello' })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  productIds?: string[];

  @ApiPropertyOptional({ description: 'ID categorie prodotti nel carrello' })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'ID utente per verificare limiti per utente' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'È il primo ordine dell\'utente?' })
  @IsOptional()
  @IsBoolean()
  isFirstOrder?: boolean;
}

// ========== VALIDATION RESULT ==========
export class CouponValidationResultDto {
  @ApiProperty() valid: boolean;
  @ApiPropertyOptional() coupon?: {
    id: string;
    code: string;
    name: string;
    type: CouponType;
    value: number;
    minimumOrderAmount?: number;
    maximumDiscountAmount?: number;
  };
  @ApiPropertyOptional() discountAmount?: number;
  @ApiPropertyOptional() errorCode?: string;
  @ApiPropertyOptional() errorMessage?: string;
}

// ========== STATS ==========
export class CouponUsageSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() collaborator: string | null;
  @ApiProperty() totalUses: number;
  @ApiProperty() totalOrders: number;
  @ApiProperty() totalRevenue: number;
  @ApiProperty() totalDiscount: number;
  @ApiProperty() netRevenue: number;
  @ApiProperty() averageOrderValue: number;
  @ApiProperty() usageLimit: number | null;
  @ApiProperty() remainingUses: number | null;
  @ApiProperty() conversionRate: number;
}

// ========== COLLABORATOR STATS ==========
export class CollaboratorStatsDto {
  @ApiProperty() collaborator: string;
  @ApiProperty() totalCoupons: number;
  @ApiProperty() totalUses: number;
  @ApiProperty() totalRevenue: number;
  @ApiProperty() totalDiscount: number;
  @ApiProperty() netRevenue: number;
  @ApiProperty({ type: [String] }) couponCodes: string[];
}

// ========== RESPONSE ==========
export class CouponResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: CouponType }) type: CouponType;
  @ApiProperty() value: number;
  @ApiPropertyOptional() minimumOrderAmount?: number;
  @ApiPropertyOptional() maximumDiscountAmount?: number;
  @ApiPropertyOptional() usageLimit?: number;
  @ApiProperty() usageLimitPerUser: number;
  @ApiProperty() usedCount: number;
  @ApiProperty() validFrom: Date;
  @ApiProperty() validUntil: Date;
  @ApiProperty({ enum: CouponStatus }) status: CouponStatus;
  @ApiPropertyOptional() applicableProducts?: string[];
  @ApiPropertyOptional() applicableCategories?: string[];
  @ApiPropertyOptional() excludedProducts?: string[];
  @ApiPropertyOptional() excludedCategories?: string[];
  @ApiProperty() isFirstOrderOnly: boolean;
  @ApiPropertyOptional() collaborator?: string;
  @ApiPropertyOptional() internalNotes?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ description: 'Il coupon è attualmente utilizzabile?' }) isCurrentlyValid: boolean;
}

export class PaginatedCouponsResponseDto {
  @ApiProperty({ type: [CouponResponseDto] }) data: CouponResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
