import { IsEnum, IsOptional, IsString, MaxLength, IsBoolean, IsArray, IsNotEmpty } from 'class-validator';
import { ReturnStatus } from '../enums/return-status.enum';

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status: ReturnStatus;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  adminNotes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  rejectionReason?: string;

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;

  @IsString()
  @IsOptional()
  returnTrackingNumber?: string;

  @IsArray()
  @IsOptional()
  adminPhotos?: string[];
}

export class RequestAdditionalInfoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  infoRequest: string;
}

export class CancelReturnDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}