import { IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportFormat {
  PDF = 'pdf',
  CSV = 'csv',
  JSON = 'json',
}

export enum ReportType {
  ORDERS = 'orders',
  PAYMENTS = 'payments',
  ACCOUNTING = 'accounting', // Report completo per commercialista
}

export class ReportFilterDto {
  @ApiPropertyOptional({ description: 'Data inizio (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data fine (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ReportFormat, default: ReportFormat.PDF })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.PDF;

  @ApiPropertyOptional({ enum: ReportType, default: ReportType.ACCOUNTING })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType = ReportType.ACCOUNTING;
}

export interface AccountingReportData {
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalShipping: number;
    totalTax: number;
    totalNet: number; // Revenue - Tax
    averageOrderValue: number;
  };
  orders: AccountingOrderData[];
  paymentMethods: {
    method: string;
    count: number;
    total: number;
  }[];
}

export interface AccountingOrderData {
  orderNumber: string;
  date: string;
  customerEmail: string;
  customerName: string;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  status: string;
  paymentMethod: string;
  stripePaymentIntentId: string;
  items: {
    name: string;
    sku: string;
    size: string;
    colorName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}
