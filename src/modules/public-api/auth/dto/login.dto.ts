import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@haraldicafirenze.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    example: 'e5b235c5-414c-46fa-8de9-aa9de1570cfb',
    description: 'ID del guest user per cart merge'
  })
  @IsOptional()
  @IsString()
  guestSessionId?: string;

  @IsOptional()
  @IsString()
  guestUserId?: string;
}