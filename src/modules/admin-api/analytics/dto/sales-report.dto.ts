import { IsOptional, IsDateString, IsNumber, Min } from "class-validator";

export class SalesReportDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  groupBy?: 'day' | 'week' | 'month' | 'product' | 'category';
}