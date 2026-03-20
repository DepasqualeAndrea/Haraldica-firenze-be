import { IsNotEmpty, IsString, IsUUID, IsEnum, IsArray, ValidateNested, IsOptional, ArrayMinSize, MaxLength, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnReason } from '../enums/return-reason.enum';

export class ReturnItemDto {
  @IsUUID()
  @IsNotEmpty()
  orderItemId: string;

  @IsOptional()
  variantId?: string;

  @IsNotEmpty()
  quantity: number;
}

export class CreateReturnDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsEnum(ReturnReason)
  @IsNotEmpty()
  reason: ReturnReason;

  @IsArray()
  @ArrayMinSize(1, { message: 'Devi selezionare almeno un prodotto da rendere' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  customerNotes?: string;

  @IsArray()
  @IsOptional()
  customerPhotos?: string[]; // URL foto già caricate

  @IsEmail()
  @IsOptional()
  customerEmail?: string; // Override email se diversa
}