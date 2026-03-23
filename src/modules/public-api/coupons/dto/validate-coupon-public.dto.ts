import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponPublicDto {
  @ApiProperty({ description: 'Codice coupon da validare' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase().trim() : value))
  code: string;

  @ApiPropertyOptional({ description: 'Subtotale carrello (senza spedizione) per calcolo sconto' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cartSubtotal?: number;
}
