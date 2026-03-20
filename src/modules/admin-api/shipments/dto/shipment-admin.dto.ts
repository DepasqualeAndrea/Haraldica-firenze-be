import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';

/**
 * DTO per filtro data spedizione
 */
export class ShipmentDateFilterDto {
  @ApiPropertyOptional({
    description: 'Data spedizione (YYYY-MM-DD)',
    example: '2026-01-20'
  })
  @IsDateString()
  @IsOptional()
  shippingDate?: string;

  @ApiPropertyOptional({
    description: 'Data inizio range',
    example: '2026-01-20'
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data fine range',
    example: '2026-01-25'
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Limite risultati',
    example: 100,
    default: 100
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number;
}

/**
 * DTO per export spedizioni
 */
export class ShipmentExportDto extends ShipmentDateFilterDto {
  @ApiPropertyOptional({
    description: 'Formato export',
    enum: ['pdf', 'csv'],
    example: 'pdf'
  })
  @IsString()
  @IsOptional()
  format?: 'pdf' | 'csv';

  @ApiPropertyOptional({
    description: 'Includi solo ordini ready-to-ship',
    default: true
  })
  @IsOptional()
  readyToShipOnly?: boolean;
}

/**
 * Response dettaglio spedizione completo
 */
export class ShipmentDetailResponseDto {
  @ApiProperty({ description: 'Dati ordine' })
  order: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
    createdAt: Date;
    customerEmail: string;
    notes?: string;
  };

  @ApiProperty({ description: 'Dati spedizione' })
  shipment: {
    id: string;
    trackingCode?: string;
    carrier?: string;
    status: string;
    estimatedDeliveryDate?: Date;
    labelFilePath?: string;
    labelDownloaded: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  @ApiProperty({ description: 'Indirizzo spedizione' })
  shippingAddress: {
    name: string;
    street: string;
    civicNumber?: string;
    city: string;
    province?: string;
    postalCode: string;
    country: string;
    phone?: string;
  };

  @ApiProperty({ description: 'Eventi tracking' })
  trackingEvents: Array<{
    date: string;
    time?: string;
    description: string;
    location?: string;
  }>;

  @ApiProperty({ description: 'Dati BRT' })
  brtData: {
    shipmentId?: string;
    trackingNumber?: string;
    tariffCode?: string;
    labelUrl?: string;
    metadata?: Record<string, any>;
  };

  @ApiProperty({ description: 'Prodotti ordinati' })
  items: Array<{
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
    total: number;
    weight?: number;
    dimensions?: {
      length?: number;
      width?: number;
      height?: number;
    };
  }>;

  @ApiProperty({ description: 'Metadati aggiuntivi' })
  metadata: {
    totalWeight: number;
    totalParcels: number;
    canBeModified: boolean;
    minutesUntilAutoConfirm?: number;
    shippingDate: string;
  };
}

/**
 * Response verifica processabilità ordine
 */
export class OrderProcessabilityDto {
  @ApiProperty({ description: 'Se può essere processato manualmente' })
  canProcess: boolean;

  @ApiProperty({ description: 'Motivo' })
  reason: string;

  @ApiProperty({ description: 'Minuti rimanenti prima auto-conferma' })
  minutesRemaining: number;

  @ApiProperty({ description: 'Se ha già un shipment' })
  hasShipment: boolean;

  @ApiProperty({ description: 'Stato corrente ordine' })
  currentStatus: string;

  @ApiProperty({ description: 'Data creazione ordine' })
  createdAt: Date;

  @ApiProperty({ description: 'Data spedizione prevista (YYYY-MM-DD)' })
  expectedShippingDate: string;
}
