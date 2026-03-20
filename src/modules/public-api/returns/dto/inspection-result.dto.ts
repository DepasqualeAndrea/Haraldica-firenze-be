import { IsNotEmpty, IsUUID, IsBoolean, IsString, IsOptional, MaxLength, IsEnum, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InspectionStatus } from 'src/database/entities/return-item.entity';

export class InspectItemDto {
  @IsUUID()
  @IsNotEmpty()
  returnItemId: string;

  @IsEnum(InspectionStatus)
  @IsNotEmpty()
  inspectionStatus: InspectionStatus;

  @IsBoolean()
  sealIntact: boolean;

  @IsBoolean()
  productConforms: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  inspectionNotes?: string;

  @IsArray()
  @IsOptional()
  inspectionPhotos?: string[]; // URL foto controllo

  @IsNumber()
  @IsOptional()
  @Min(0)
  refundAmount?: number; // Se diverso da prezzo originale
}

export class InspectionResultDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectItemDto)
  items: InspectItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  generalNotes?: string; // Note generali controllo

  @IsBoolean()
  @IsOptional()
  reintegrateStock?: boolean; // Default: true se approved
}

export class ProcessRefundDto {
  @IsUUID()
  @IsNotEmpty()
  returnId: string;

  @IsBoolean()
  @IsOptional()
  includeShippingCost?: boolean; // Rimborsa anche spese spedizione originali

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}