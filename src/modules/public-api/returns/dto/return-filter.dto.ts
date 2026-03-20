import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsDateString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnReason } from '../enums/return-reason.enum';

export class ReturnFilterDto {
  // PAGINATION
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // FILTERS
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @IsOptional()
  @IsEnum(ReturnReason)
  reason?: ReturnReason;

  @IsOptional()
  @IsUUID()
  userId?: string; // Admin only

  @IsOptional()
  @IsString()
  returnNumber?: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  // SORTING
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'updatedAt' | 'totalValue' | 'returnNumber' = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  // FLAGS (admin filters)
  @IsOptional()
  @Type(() => Boolean)
  requiresAction?: boolean; // Solo resi che necessitano azione admin

  @IsOptional()
  @Type(() => Boolean)
  pendingRefund?: boolean; // Solo resi approvati ma non ancora rimborsati
}

export class ReturnStatsFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}