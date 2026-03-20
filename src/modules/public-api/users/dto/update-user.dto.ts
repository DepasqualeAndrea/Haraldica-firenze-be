// src/modules/users/dto/update-user.dto.ts

import { PartialType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  password?: never; // Non aggiornare password tramite update
}