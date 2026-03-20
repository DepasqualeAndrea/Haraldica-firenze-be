import { Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShippingCompatibilityDto {
  @ApiProperty({ description: 'Spedizione supportata' })
  isSupported: boolean;

  @ApiProperty({ description: 'Giorni stimati consegna' })
  estimatedDays: number;

  @ApiProperty({ description: 'Corrieri disponibili', type: [String] })
  availableCarriers: string[];

  @ApiProperty({ description: 'Restrizioni spedizione', type: [String] })
  restrictions: string[];

  @ApiProperty({ description: 'Costi aggiuntivi' })
  additionalCosts: number;
}

export class AddressResponseDto {
  @ApiProperty({ description: 'ID indirizzo' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Nome destinatario' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Indirizzo' })
  @Expose()
  street: string;

  @ApiProperty({ description: 'Città' })
  @Expose()
  city: string;
  
  @ApiProperty({ description: 'Provincia' })
  @Expose()
  province: string;
  
  @ApiProperty({ description: 'Provincia' })
  @Expose()
  provinceCode: string;

  @ApiProperty({ description: 'Codice postale' })
  @Expose()
  postalCode: string;

  @ApiProperty({ description: 'Paese' })
  @Expose()
  country: string;

  @ApiPropertyOptional({ description: 'Telefono' })
  @Expose()
  phone?: string;

  @ApiPropertyOptional({ description: 'Azienda' })
  @Expose()
  company?: string;

  @ApiPropertyOptional({ description: 'Partita IVA' })
  @Expose()
  vatNumber?: string;

  @ApiProperty({ description: 'È indirizzo predefinito' })
  @Expose()
  isDefault: boolean;

  @ApiProperty({ description: 'Tipo indirizzo', enum: ['shipping', 'billing'] })
  @Expose()
  type: 'shipping' | 'billing';

  @ApiPropertyOptional({ description: 'Note aggiuntive' })
  @Expose()
  notes?: string;

  @ApiProperty({ description: 'Data creazione' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Data ultima modifica' })
  @Expose()
  updatedAt: Date;

  // ✅ NUOVI CAMPI ENHANCED
  @ApiPropertyOptional({ description: 'Info compatibilità spedizione', type: () => ShippingCompatibilityDto })
  @Expose()
  @Type(() => ShippingCompatibilityDto)
  shippingInfo?: ShippingCompatibilityDto;
}

export class AddressListResponseDto {
  @ApiProperty({ description: 'Lista indirizzi', type: [AddressResponseDto] })
  @Type(() => AddressResponseDto)
  addresses: AddressResponseDto[];

  @ApiProperty({ description: 'Numero totale indirizzi' })
  total: number;

  @ApiPropertyOptional({ description: 'Indirizzo spedizione predefinito' })
  @Type(() => AddressResponseDto)
  defaultShipping?: AddressResponseDto | null;

  @ApiPropertyOptional({ description: 'Indirizzo fatturazione predefinito' })
  @Type(() => AddressResponseDto)
  defaultBilling?: AddressResponseDto | null;
}

export class CountryBreakdownDto {
  @ApiProperty({ description: 'Paese' })
  country: string;

  @ApiProperty({ description: 'È supportato per spedizioni' })
  isSupported: boolean;

  @ApiProperty({ description: 'Numero indirizzi in questo paese' })
  count: number;
}

export class AddressStatsResponseDto {
  @ApiProperty({ description: 'Numero totale indirizzi' })
  totalAddresses: number;

  @ApiProperty({ description: 'Indirizzi di spedizione' })
  shippingAddresses: number;

  @ApiProperty({ description: 'Indirizzi di fatturazione' })
  billingAddresses: number;

  @ApiProperty({ description: 'Ha indirizzo spedizione predefinito' })
  hasDefaultShipping: boolean;

  @ApiProperty({ description: 'Ha indirizzo fatturazione predefinito' })
  hasDefaultBilling: boolean;

  @ApiProperty({ description: 'Paesi supportati per spedizione' })
  supportedCountries: number;

  @ApiProperty({ description: 'Paesi NON supportati' })
  unsupportedCountries: number;

  @ApiProperty({ description: 'Breakdown per paese', type: [CountryBreakdownDto] })
  @Type(() => CountryBreakdownDto)
  countriesBreakdown: CountryBreakdownDto[];

  @ApiProperty({ description: 'Indirizzi che necessitano validazione' })
  needsValidation: number;
}

export class CheckoutRecommendationsDto {
  @ApiPropertyOptional({ description: 'Indirizzo spedizione consigliato' })
  @Type(() => AddressResponseDto)
  preferredShipping?: AddressResponseDto;

  @ApiPropertyOptional({ description: 'Indirizzo fatturazione consigliato' })
  @Type(() => AddressResponseDto)
  preferredBilling?: AddressResponseDto;

  @ApiProperty({ description: 'ID indirizzi che necessitano validazione', type: [String] })
  needsValidation: string[];
}

export class CheckoutAddressesResponseDto {
  @ApiProperty({ description: 'Indirizzi spedizione disponibili', type: [AddressResponseDto] })
  @Type(() => AddressResponseDto)
  shipping: AddressResponseDto[];

  @ApiProperty({ description: 'Indirizzi fatturazione disponibili', type: [AddressResponseDto] })
  @Type(() => AddressResponseDto)
  billing: AddressResponseDto[];

  @ApiProperty({ description: 'Raccomandazioni per checkout' })
  @Type(() => CheckoutRecommendationsDto)
  recommendations: CheckoutRecommendationsDto;
}

export class AddressValidationResponseDto {
  @ApiProperty({ description: 'Indirizzo è valido' })
  isValid: boolean;

  @ApiProperty({ description: 'Errori di validazione', type: [String] })
  errors: string[];

  @ApiProperty({ description: 'Avvisi', type: [String] })
  warnings: string[];

  @ApiPropertyOptional({ description: 'Suggerimenti miglioramento' })
  suggestions?: {
    formattedAddress?: string;
    normalizedPostalCode?: string;
    suggestedCity?: string;
  };
}
