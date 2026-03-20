// src/modules/public-api/brt/dto/brt-shipment-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO per la risposta di creazione spedizione
 */
export class BrtShipmentResponseDto {
  @ApiProperty({ description: 'ID ordine' })
  orderId: string;

  @ApiProperty({ description: 'Numero ordine Haraldica Firenze' })
  orderNumber: string;

  @ApiProperty({ description: 'Tracking number BRT' })
  trackingNumber: string;

  @ApiProperty({ description: 'Barcode BRT (parcelID)' })
  parcelID: string;

  @ApiProperty({ description: 'Numero spedizione BRT' })
  brtShipmentNumber: string;

  @ApiProperty({ description: 'Stato spedizione' })
  status: string;

  @ApiProperty({ description: 'Filiale arrivo' })
  arrivalDepot: string;

  @ApiProperty({ description: 'Zona consegna' })
  deliveryZone: string;

  @ApiProperty({ description: 'Numero colli' })
  numberOfParcels: number;

  @ApiProperty({ description: 'Peso totale (kg)' })
  weightKG: number;

  @ApiPropertyOptional({ description: 'URL etichetta su S3' })
  labelUrl?: string;

  @ApiPropertyOptional({ description: 'Data consegna stimata' })
  estimatedDeliveryDate?: Date;

  @ApiProperty({ description: 'Confermata su BRT', default: false })
  isConfirmed: boolean;

  @ApiProperty({ description: 'Data creazione' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Messaggio di avviso' })
  warning?: string;
}

/**
 * DTO per tracking info
 */
export class BrtTrackingInfoDto {
  @ApiProperty({ description: 'Tracking number' })
  trackingNumber: string;

  @ApiProperty({ description: 'Stato corrente' })
  currentStatus: string;

  @ApiProperty({ description: 'Ultimo aggiornamento' })
  lastUpdate: Date;

  @ApiPropertyOptional({ description: 'Data consegna stimata' })
  estimatedDeliveryDate?: Date;

  @ApiPropertyOptional({ description: 'Data consegna effettiva' })
  deliveredAt?: Date;

  @ApiProperty({ description: 'Eventi tracking', type: [Object] })
  events: BrtTrackingEventDto[];

  @ApiPropertyOptional({ description: 'Note' })
  notes?: string[];

  @ApiProperty({ description: 'Destinatario' })
  consignee: {
    name: string;
    address: string;
    city: string;
    zipCode: string;
    province?: string;
  };
}

export class BrtTrackingEventDto {
  @ApiProperty({ description: 'Data evento' })
  date: string;

  @ApiPropertyOptional({ description: 'Ora evento' })
  time?: string;

  @ApiProperty({ description: 'Descrizione evento' })
  description: string;

  @ApiPropertyOptional({ description: 'Località' })
  location?: string;
}

/**
 * DTO per lista spedizioni pronte
 */
export class ReadyToShipListDto {
  @ApiProperty({ description: 'Totale spedizioni pronte' })
  total: number;

  @ApiProperty({ description: 'Valore totale spedizioni (€)' })
  totalValue: number;

  @ApiProperty({ description: 'Totale colli' })
  totalParcels: number;

  @ApiProperty({ description: 'Peso totale (kg)' })
  totalWeight: number;

  @ApiProperty({ description: 'Lista ordini', type: [Object] })
  orders: ReadyToShipOrderDto[];
}

export class ReadyToShipOrderDto {
  @ApiProperty({ description: 'ID ordine' })
  orderId: string;

  @ApiProperty({ description: 'Numero ordine' })
  orderNumber: string;

  @ApiProperty({ description: 'Data ordine' })
  orderDate: Date;

  @ApiProperty({ description: 'Cliente' })
  customer: {
    email: string;
    name: string;
  };

  @ApiProperty({ description: 'Destinatario' })
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    province?: string;
    country: string;
  };

  @ApiProperty({ description: 'Totale ordine (€)' })
  total: number;

  @ApiProperty({ description: 'Numero prodotti' })
  itemsCount: number;

  @ApiProperty({ description: 'Prodotti ordinati', type: [String] })
  products: string[];

  @ApiPropertyOptional({ description: 'Tracking BRT' })
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'URL etichetta' })
  labelUrl?: string;

  @ApiProperty({ description: 'Peso stimato (kg)' })
  estimatedWeight: number;

  @ApiProperty({ description: 'Numero colli' })
  numberOfParcels: number;

  @ApiProperty({ description: 'Stato' })
  status: string;

  @ApiPropertyOptional({ description: 'Note' })
  notes?: string;
}

/**
 * DTO per risposta conferma spedizione
 */
export class BrtConfirmResponseDto {
  @ApiProperty({ description: 'Success' })
  success: boolean;

  @ApiProperty({ description: 'Messaggio' })
  message: string;

  @ApiProperty({ description: 'ID ordine confermato' })
  orderId: string;

  @ApiProperty({ description: 'Tracking number' })
  trackingNumber: string;

  @ApiProperty({ description: 'Timestamp conferma' })
  confirmedAt: Date;
}

/**
 * DTO per risposta bulk confirm
 */
export class BrtBulkConfirmResponseDto {
  @ApiProperty({ description: 'Totale richieste' })
  total: number;

  @ApiProperty({ description: 'Successi' })
  successful: number;

  @ApiProperty({ description: 'Fallimenti' })
  failed: number;

  @ApiProperty({ description: 'Dettagli successi', type: [Object] })
  successDetails: Array<{
    orderId: string;
    orderNumber: string;
    trackingNumber: string;
    confirmedAt: Date;
  }>;

  @ApiProperty({ description: 'Dettagli errori', type: [Object] })
  errorDetails: Array<{
    orderId: string;
    orderNumber: string;
    error: string;
  }>;
}

/**
 * DTO per risposta cancellazione
 */
export class BrtDeleteResponseDto {
  @ApiProperty({ description: 'Success' })
  success: boolean;

  @ApiProperty({ description: 'Messaggio' })
  message: string;

  @ApiProperty({ description: 'ID ordine cancellato' })
  orderId: string;

  @ApiPropertyOptional({ description: 'Tracking number cancellato' })
  trackingNumber?: string;

  @ApiProperty({ description: 'Timestamp cancellazione' })
  deletedAt: Date;
}

/**
 * DTO per errori BRT
 */
export class BrtErrorResponseDto {
  @ApiProperty({ description: 'Codice errore' })
  code: number;

  @ApiProperty({ description: 'Severity', enum: ['INFO', 'WARNING', 'ERROR'] })
  severity: 'INFO' | 'WARNING' | 'ERROR';

  @ApiProperty({ description: 'Descrizione errore' })
  codeDesc: string;

  @ApiProperty({ description: 'Messaggio dettagliato' })
  message: string;

  @ApiPropertyOptional({ description: 'Timestamp' })
  timestamp?: string;
}