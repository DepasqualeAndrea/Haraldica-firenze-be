import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, Length, IsPhoneNumber } from "class-validator";

export class CreateAddressDto {
  @ApiProperty({ description: 'Nome destinatario', example: 'Mario Rossi' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;

  @ApiProperty({ description: 'Indirizzo completo', example: 'Via Roma 123' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  street: string;

  @ApiProperty({ description: 'Città', example: 'Milano' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  city: string;

  @ApiProperty({ description: 'Codice postale', example: '20100' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  postalCode: string;

  @ApiProperty({ description: 'Paese (ISO Alpha-2)', example: 'IT' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  country: string;

  @ApiPropertyOptional({ description: 'Telefono', example: '+39 123 456 7890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Nome provincia', example: 'Ascoli Piceno' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  province?: string;

  @ApiPropertyOptional({ description: 'Sigla provincia', example: 'AP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Nome azienda', example: 'Haraldica Firenze SRL' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Partita IVA', example: 'IT12345678901' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ description: 'Imposta come predefinito', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Tipo indirizzo',
    enum: ['shipping', 'billing'],
    default: 'shipping'
  })
  @IsOptional()
  @IsEnum(['shipping', 'billing'])
  type?: 'shipping' | 'billing';

  @ApiPropertyOptional({ description: 'Note aggiuntive', example: 'Citofono al piano terra' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class UpdateAddressDto {
  @ApiPropertyOptional({ description: 'Nome destinatario' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ description: 'Indirizzo completo' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  street?: string;

  @ApiPropertyOptional({ description: 'Città' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({ description: 'Codice postale' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Paese (ISO Alpha-2)' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: 'Telefono' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Nome provincia' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  province?: string;

  @ApiPropertyOptional({ description: 'Sigla provincia' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Nome azienda' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Partita IVA' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ description: 'Imposta come predefinito' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Note aggiuntive' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}