import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsEnum } from 'class-validator';

export enum DashboardPeriod {
  ALL = 'all',
  DAILY = 'daily',
  MONTHLY = 'monthly',
}

/**
 * DTO per filtri dashboard
 */
export class DashboardFilterDto {
  @ApiProperty({
    description: 'Periodo da visualizzare',
    enum: DashboardPeriod,
    required: false,
    example: DashboardPeriod.ALL,
  })
  @IsEnum(DashboardPeriod)
  @IsOptional()
  period?: DashboardPeriod = DashboardPeriod.ALL;
  @ApiProperty({
    description: 'Data inizio periodo',
    required: false,
    example: '2026-01-01'
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({
    description: 'Data fine periodo',
    required: false,
    example: '2026-01-31'
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

/**
 * Response statistiche dashboard
 */
export class DashboardStatsDto {
  @ApiProperty({ description: 'Periodo applicato' })
  period: string;

  @ApiProperty({ description: 'Range date filtrato', required: false })
  dateRange?: {
    startDate: string;
    endDate: string;
  };

  @ApiProperty({ description: 'Statistiche ordini' })
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    processing: number;
    readyToShip: number;
    shipped: number;
    inTransit: number;
    delivered: number;
    cancelled: number;
    todayCount: number;
  };

  @ApiProperty({ description: 'Statistiche spedizioni' })
  shipments: {
    readyToShip: number;
    awaitingPickup: number;
    inTransit: number;
    delivered: number;
    withIssues: number;
    todayCreated: number;
  };

  @ApiProperty({ description: 'Statistiche finanziarie' })
  revenue: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    averageOrderValue: number;
  };

  @ApiProperty({ description: 'Azioni richieste' })
  actionRequired: {
    ordersNeedingShipment: number;
    ordersNearAutoConfirm: number;
    shipmentsWithIssues: number;
    lowStockProducts: number;
  };

  @ApiProperty({ description: 'Data spedizione corrente' })
  currentShippingDate: string;
}
