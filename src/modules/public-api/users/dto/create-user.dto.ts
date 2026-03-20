// src/modules/users/dto/create-user.dto.ts

import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from 'src/database/entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'Mario' })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ example: 'Rossi' })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiProperty({ example: 'mario.rossi@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'HashedPassword123!' })
  @IsString()
  password: string;

  @ApiProperty({ example: '+39 333 1234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.CUSTOMER })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stripeCustomerId?: string;
}