import { IsEmail, IsString, MinLength, Matches, IsBoolean, IsIn, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Mario', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @ApiProperty({ example: 'Rossi', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @ApiPropertyOptional({ example: '1990-05-15', description: 'Data di nascita (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'M', description: 'Genere: M, F, altro' })
  @IsOptional()
  @IsIn(['M', 'F', 'altro'])
  gender?: string;

  @ApiProperty({ example: 'mario.rossi@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'La password deve contenere almeno una maiuscola, una minuscola, un numero e un carattere speciale.' }
  )
  password: string;

  @ApiProperty({ example: '+39 333 1234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Accettazione dei Termini e Condizioni' })
  @IsIn([true], { message: 'È obbligatorio accettare i Termini e Condizioni.' })
  agreeTerms: boolean;

  @ApiProperty({ description: 'Accettazione della Privacy Policy' })
  @IsIn([true], { message: 'È obbligatorio accettare la Privacy Policy.' })
  agreePrivacy: boolean;

  @ApiProperty({ description: 'Consenso newsletter/marketing', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  agreeNewsletter?: boolean;

  @ApiPropertyOptional({
    example: 'e5b235c5-414c-46fa-8de9-aa9de1570cfb',
    description: 'ID del guest user da convertire in customer'
  })
  @IsOptional()
  @IsString()
  guestSessionId?: string;

  @ApiPropertyOptional({
    example: 'e5b235c5-414c-46fa-8de9-aa9de1570cfb',
    description: 'ID del guest user da convertire in customer'
  })
  @IsOptional()
  @IsString()
  guestUserId?: string;
}