import { IsOptional, IsDateString, IsEnum, IsNumber, Min } from 'class-validator';

export enum AnalyticsPeriod {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom'
}

export enum AnalyticsMetric {
  REVENUE = 'revenue',
  ORDERS = 'orders',
  CUSTOMERS = 'customers',
  PRODUCTS = 'products',
  CONVERSION = 'conversion'
}

export class AnalyticsQueryDto {
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(AnalyticsMetric)
  metric?: AnalyticsMetric;
}