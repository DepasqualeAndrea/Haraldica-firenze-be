// src/modules/public-api/brt/dto/create-brt-shipment.dto.ts

import { IsString, IsNumber, IsEmail, IsOptional, IsEnum, Min, Max, MaxLength, ValidateNested, IsBoolean, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO per creare una spedizione BRT dal nostro Order
 */
export class CreateBrtShipmentDto {
  @ApiPropertyOptional({ description: 'ID dell\'ordine da spedire (opzionale se passato nel path)' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Richiesta generazione etichetta PDF', default: true })
  @IsOptional()
  @IsBoolean()
  generateLabel?: boolean = true;

  @ApiPropertyOptional({ description: 'Note aggiuntive per la spedizione' })
  @IsOptional()
  @IsString()
  @MaxLength(70)
  notes?: string;

  @ApiPropertyOptional({ description: 'Tipo servizio BRT', enum: ['', 'E', 'H'] })
  @IsOptional()
  @IsEnum(['', 'E', 'H'])
  serviceType?: '' | 'E' | 'H' = ''; // '' = standard, E = priority, H = 10:30

  @ApiPropertyOptional({ description: 'Peso totale in kg (se diverso dal default)' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  weightKG?: number;

  @ApiPropertyOptional({ description: 'Numero colli (se diverso dal default)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  numberOfParcels?: number;
}

/**
 * DTO per indirizzo destinatario
 */
export class BrtConsigneeAddressDto {
  @ApiProperty({ description: 'Nome completo o ragione sociale' })
  @IsString()
  @MaxLength(70)
  companyName: string;

  @ApiProperty({ description: 'Indirizzo completo' })
  @IsString()
  @MaxLength(105)
  address: string;

  @ApiProperty({ description: 'CAP' })
  @IsString()
  @MaxLength(9)
  zipCode: string;

  @ApiProperty({ description: 'Città' })
  @IsString()
  @MaxLength(35)
  city: string;

  @ApiPropertyOptional({ description: 'Sigla provincia (es. RM, MI)' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  province?: string;

  @ApiProperty({ description: 'Codice paese ISO alpha-2 (es. IT)', default: 'IT' })
  @IsString()
  @MaxLength(2)
  country: string = 'IT';

  @ApiPropertyOptional({ description: 'Nome referente' })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  contactName?: string;

  @ApiPropertyOptional({ description: 'Telefono' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  phone?: string;

  @ApiPropertyOptional({ description: 'Email (multipli separati da |)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(70)
  email?: string;

  @ApiPropertyOptional({ description: 'Cellulare' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  mobilePhone?: string;
}

/**
 * DTO per conferma spedizione BRT (dopo ritiro)
 */
export class ConfirmBrtShipmentDto {
  @ApiPropertyOptional({ description: 'ID ordine da confermare' })
  @IsOptional()
  @IsString()
  orderId?: string;
}

/**
 * DTO per conferma massiva spedizioni (bulk confirm)
 */
export class BulkConfirmBrtShipmentsDto {
  @ApiProperty({ description: 'Array di order IDs da confermare', type: [String] })
  @IsArray()
  @IsString({ each: true })
  orderIds: string[];
}

/**
 * DTO per cancellazione spedizione BRT
 */
export class DeleteBrtShipmentDto {
  @ApiProperty({
    description: 'Codice cliente mittente BRT',
    example: 1020100,
  })
  @IsNumber()
  senderCustomerCode: number;

  @ApiProperty({
    description: 'Riferimento numerico mittente (timestamp)',
    example: 1733500000,
  })
  @IsNumber()
  numericSenderReference: number;

  @ApiProperty({
    description: 'Riferimento alfanumerico mittente (orderNumber)',
    example: 'MRV20251206001',
  })
  @IsString()
  @MaxLength(35)
  alphanumericSenderReference: string;

  @ApiPropertyOptional({
    description: 'Motivo cancellazione',
    example: 'Ordine cancellato dall\'utente',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

/**
 * DTO per tracking spedizione BRT
 * Almeno uno dei due campi deve essere presente
 */
export class TrackBrtShipmentDto {
  @ApiPropertyOptional({ description: 'ID ordine' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Tracking number BRT' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;
}

/**
 * DTO per filtrare spedizioni pronte
 */
export class GetReadyToShipDto {
  @ApiPropertyOptional({ description: 'Data inizio (ISO)', example: '2025-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data fine (ISO)', example: '2025-01-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Stato ordine', enum: ['ready_to_ship', 'confirmed'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Limite risultati', default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;
}

/**
 * DTO per generare report giornaliero
 */
export class GenerateDailyReportDto {
  @ApiPropertyOptional({ description: 'Data report (ISO)', example: '2025-01-01' })
  @IsOptional()
  @IsString()
  date?: string; // Default: oggi

  @ApiPropertyOptional({ description: 'Includi etichette nel ZIP', default: true })
  @IsOptional()
  @IsBoolean()
  includeLabels?: boolean = true;

  @ApiPropertyOptional({ description: 'Invia email', default: false })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean = false;
}