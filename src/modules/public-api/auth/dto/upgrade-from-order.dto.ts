import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsUUID } from 'class-validator';

export class UpgradeFromOrderDto {
  @ApiProperty({ description: 'ID (UUID) dell\'ordine guest da associare al nuovo utente' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 'nuovo.utente@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;
}