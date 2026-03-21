import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';

import { AddressService } from './addresses.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AddressResponseDto, AddressListResponseDto, AddressStatsResponseDto, AddressValidationResponseDto, ShippingCompatibilityDto, CheckoutAddressesResponseDto } from './dto/response.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('addresses')
@Controller('addresses')
// @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
@ApiBearerAuth()
export class AddressesController {
  constructor(private addressService: AddressService) { }

  // ===========================
  // CORE CRUD ENDPOINTS
  // ===========================

  @Post()
  @ApiOperation({
    summary: 'Crea nuovo indirizzo',
    description: 'Crea un nuovo indirizzo con validazione geografica automatica e normalizzazione dati'
  })
  @ApiResponse({ status: 201, description: 'Indirizzo creato con successo', type: AddressResponseDto })
  @ApiResponse({ status: 400, description: 'Dati indirizzo non validi' })
  async create(
    @CurrentUser() user: any,
    @Body() createAddressDto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.addressService.createAddressForUser(user.id, createAddressDto);
    return this.mapAddressToResponseDto(address);
  }

  @Get('me')
  @ApiOperation({
    summary: 'I miei indirizzi',
    description: 'Lista completa degli indirizzi utente con info compatibilità spedizione'
  })
  @ApiQuery({ name: 'type', required: false, enum: ['shipping', 'billing'], description: 'Filtra per tipo indirizzo' })
  @ApiResponse({ status: 200, description: 'Lista indirizzi', type: AddressListResponseDto })
  async getMyAddresses(
    @CurrentUser() user: any,
    @Query('type') type?: 'shipping' | 'billing',
  ): Promise<AddressListResponseDto> {
    const addresses = await this.addressService.findUserAddresses(user.id, type);
    const defaultShipping = await this.addressService.getDefaultAddress(user.id, 'shipping');
    const defaultBilling = await this.addressService.getDefaultAddress(user.id, 'billing');

    return {
      addresses: addresses.map(addr => this.mapAddressToResponseDto(addr)),
      total: addresses.length,
      defaultShipping: defaultShipping ? this.mapAddressToResponseDto(defaultShipping) : undefined,
      defaultBilling: defaultBilling ? this.mapAddressToResponseDto(defaultBilling) : undefined,
    };
  }

  @Get('me/default')
  @ApiOperation({
    summary: 'Indirizzo predefinito',
    description: 'Ottieni indirizzo predefinito per tipo specifico'
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['shipping', 'billing'],
    description: 'Tipo indirizzo predefinito da ottenere',
    example: 'shipping'
  })
  @ApiResponse({ status: 200, description: 'Indirizzo predefinito', type: AddressResponseDto })
  @ApiResponse({ status: 404, description: 'Nessun indirizzo predefinito trovato' })
  async getDefaultAddress(
    @CurrentUser() user: any,
    @Query('type') type: 'shipping' | 'billing' = 'shipping',
  ): Promise<AddressResponseDto | null> {
    const address = await this.addressService.getDefaultAddress(user.id, type);
    return address ? this.mapAddressToResponseDto(address) : null;
  }

  @Get('me/stats')
  @ApiOperation({
    summary: 'Statistiche indirizzi utente',
    description: 'Statistiche complete degli indirizzi con breakdown geografico'
  })
  @ApiResponse({ status: 200, description: 'Statistiche indirizzi', type: AddressStatsResponseDto })
  async getAddressStats(@CurrentUser() user: any): Promise<AddressStatsResponseDto> {
    const stats = await this.addressService.getAddressStats(user.id);

    return {
      totalAddresses: stats.totalAddresses,
      shippingAddresses: stats.shippingAddresses,
      billingAddresses: stats.billingAddresses,
      hasDefaultShipping: stats.hasDefaultShipping,
      hasDefaultBilling: stats.hasDefaultBilling,
      supportedCountries: 9,
      unsupportedCountries: 0,
      countriesBreakdown: [],
      needsValidation: 0,
    };
  }

  @Get('me/:id')
  @ApiOperation({
    summary: 'Dettaglio indirizzo',
    description: 'Ottieni dettagli completi di un indirizzo specifico'
  })
  @ApiParam({ name: 'id', description: 'ID indirizzo' })
  @ApiResponse({ status: 200, description: 'Dettaglio indirizzo', type: AddressResponseDto })
  @ApiResponse({ status: 404, description: 'Indirizzo non trovato' })
  async getAddress(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Promise<AddressResponseDto> {
    const address = await this.addressService.findOne(addressId, user.id);

    if (!address) {
      throw new NotFoundException(`Indirizzo ${addressId} non trovato`);
    }

    return this.mapAddressToResponseDto(address);
  }

  @Put('me/:id')
  @ApiOperation({
    summary: 'Aggiorna indirizzo',
    description: 'Aggiorna indirizzo con validazione automatica se cambiano dati geografici'
  })
  @ApiParam({ name: 'id', description: 'ID indirizzo' })
  @ApiResponse({ status: 200, description: 'Indirizzo aggiornato', type: AddressResponseDto })
  @ApiResponse({ status: 400, description: 'Dati aggiornamento non validi' })
  @ApiResponse({ status: 404, description: 'Indirizzo non trovato' })
  async update(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.addressService.updateAddress(addressId, updateAddressDto, user.id);
    return this.mapAddressToResponseDto(address);
  }

  @Put('me/:id/default')
  @ApiOperation({
    summary: 'Imposta come predefinito',
    description: 'Imposta un indirizzo come predefinito per il suo tipo'
  })
  @ApiParam({ name: 'id', description: 'ID indirizzo' })
  @ApiResponse({ status: 200, description: 'Indirizzo impostato come predefinito', type: AddressResponseDto })
  @ApiResponse({ status: 404, description: 'Indirizzo non trovato' })
  async setDefault(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Promise<AddressResponseDto> {
    const address = await this.addressService.setDefaultAddress(addressId, user.id);
    return this.mapAddressToResponseDto(address);
  }

  @Delete('me/:id')
  @ApiOperation({
    summary: 'Elimina indirizzo',
    description: 'Elimina indirizzo con verifica sicurezza'
  })
  @ApiParam({ name: 'id', description: 'ID indirizzo' })
  @ApiResponse({ status: 200, description: 'Indirizzo eliminato con successo' })
  @ApiResponse({ status: 404, description: 'Indirizzo non trovato' })
  async remove(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Promise<{ message: string }> {
    await this.addressService.removeAddress(addressId, user.id);
    return { message: 'Indirizzo eliminato con successo' };
  }

  // ===========================
  // ENDPOINT ENHANCED
  // ===========================

  @Post('validate')
  @ApiOperation({
    summary: 'Valida indirizzo',
    description: 'Valida un indirizzo senza salvarlo, con suggerimenti di correzione'
  })
  @ApiResponse({ status: 200, description: 'Risultato validazione', type: AddressValidationResponseDto })
  async validateAddress(
    @Body() addressData: CreateAddressDto,
  ): Promise<AddressValidationResponseDto> {
    const result = await this.addressService.validateAddressData(addressData);
    return {
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      suggestions: result.suggestions
    };
  }

  @Get('me/:id/shipping-info')
  @ApiOperation({
    summary: 'Info compatibilità spedizione',
    description: 'Ottieni informazioni dettagliate sulla compatibilità spedizione per un indirizzo'
  })
  @ApiParam({ name: 'id', description: 'ID indirizzo' })
  @ApiResponse({ status: 200, description: 'Info spedizione', type: ShippingCompatibilityDto })
  @ApiResponse({ status: 404, description: 'Indirizzo non trovato' })
  async getShippingInfo(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Promise<ShippingCompatibilityDto> {
    const address = await this.addressService.findOne(addressId, user.id);

    if (!address) {
      throw new NotFoundException(`Indirizzo ${addressId} non trovato`);
    }

    const supportedCountries = ['IT', 'FR', 'DE', 'ES', 'AT', 'BE', 'NL', 'PT', 'GR'];
    const isSupported = supportedCountries.includes(address.country.toUpperCase());

    const estimatedDays = this.getEstimatedDeliveryDays(address.country);
    const availableCarriers = isSupported ? ['DHL', 'UPS', 'FedEx'] : [];
    const restrictions = isSupported ? [] : ['Paese non supportato per spedizione'];

    return {
      isSupported,
      estimatedDays,
      availableCarriers,
      restrictions,
      additionalCosts: isSupported ? 0 : 999,
    };
  }

  @Get('me/checkout')
  @ApiOperation({
    summary: 'Indirizzi per checkout',
    description: 'Ottieni indirizzi ottimizzati per il processo di checkout con raccomandazioni'
  })
  @ApiResponse({ status: 200, description: 'Indirizzi checkout', type: CheckoutAddressesResponseDto })
  async getCheckoutAddresses(
    @CurrentUser() user: any,
  ): Promise<CheckoutAddressesResponseDto> {
    const addressesData = await this.addressService.getAddressesForCheckout(user.id);

    return {
      shipping: addressesData.shipping.map(addr => this.mapAddressToResponseDto(addr)),
      billing: addressesData.billing.map(addr => this.mapAddressToResponseDto(addr)),
      recommendations: {
        preferredShipping: addressesData.defaultShipping ?
          this.mapAddressToResponseDto(addressesData.defaultShipping) : undefined,
        preferredBilling: addressesData.defaultBilling ?
          this.mapAddressToResponseDto(addressesData.defaultBilling) : undefined,
        needsValidation: [],
      },
    };
  }

  @Get('supported-countries')
  @ApiOperation({
    summary: 'Paesi supportati per spedizione',
    description: 'Lista dei paesi supportati con info spedizione'
  })
  @ApiResponse({
    status: 200,
    description: 'Paesi supportati',
    schema: {
      type: 'object',
      properties: {
        countries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'IT' },
              name: { type: 'string', example: 'Italia' },
              estimatedDays: { type: 'number', example: 2 },
              postalCodePattern: { type: 'string', example: '^\\d{5}$' }
            }
          }
        },
        totalSupported: { type: 'number', example: 9 }
      }
    }
  })
  async getSupportedCountries(): Promise<{
    countries: Array<{
      code: string;
      name: string;
      estimatedDays: number;
      postalCodePattern: string;
    }>;
    totalSupported: number;
  }> {
    const supportedCountries = [
      { code: 'IT', name: 'Italia', estimatedDays: 2, postalCodePattern: '^\\d{5}$' },
      { code: 'FR', name: 'Francia', estimatedDays: 4, postalCodePattern: '^\\d{5}$' },
      { code: 'DE', name: 'Germania', estimatedDays: 4, postalCodePattern: '^\\d{5}$' },
      { code: 'ES', name: 'Spagna', estimatedDays: 5, postalCodePattern: '^\\d{5}$' },
      { code: 'AT', name: 'Austria', estimatedDays: 4, postalCodePattern: '^\\d{4}$' },
      { code: 'BE', name: 'Belgio', estimatedDays: 4, postalCodePattern: '^\\d{4}$' },
      { code: 'NL', name: 'Paesi Bassi', estimatedDays: 4, postalCodePattern: '^\\d{4}\\s?[A-Z]{2}$' },
      { code: 'PT', name: 'Portogallo', estimatedDays: 5, postalCodePattern: '^\\d{4}-\\d{3}$' },
      { code: 'GR', name: 'Grecia', estimatedDays: 6, postalCodePattern: '^\\d{5}$' },
    ];

    return {
      countries: supportedCountries,
      totalSupported: supportedCountries.length
    };
  }

  // ===========================
  // UTILITY ENDPOINTS
  // ===========================

  @Get('postal-code/:country/:code/validate')
  @ApiOperation({
    summary: 'Valida codice postale',
    description: 'Valida formato codice postale per paese specifico'
  })
  @ApiParam({ name: 'country', description: 'Codice paese (ISO Alpha-2)', example: 'IT' })
  @ApiParam({ name: 'code', description: 'Codice postale da validare', example: '20100' })
  @ApiResponse({
    status: 200,
    description: 'Risultato validazione',
    schema: {
      type: 'object',
      properties: {
        isValid: { type: 'boolean' },
        normalizedCode: { type: 'string' },
        country: { type: 'string' },
        format: { type: 'string' }
      }
    }
  })
  async validatePostalCode(
    @Param('country') country: string,
    @Param('code') postalCode: string,
  ): Promise<{
    isValid: boolean;
    normalizedCode: string;
    country: string;
    format: string;
  }> {
    const patterns = {
      'IT': { pattern: /^\d{5}$/, format: '12345' },
      'FR': { pattern: /^\d{5}$/, format: '12345' },
      'DE': { pattern: /^\d{5}$/, format: '12345' },
      'ES': { pattern: /^\d{5}$/, format: '12345' },
      'AT': { pattern: /^\d{4}$/, format: '1234' },
      'BE': { pattern: /^\d{4}$/, format: '1234' },
      'NL': { pattern: /^\d{4}\s?[A-Z]{2}$/, format: '1234 AB' },
      'PT': { pattern: /^\d{4}-\d{3}$/, format: '1234-567' },
      'GR': { pattern: /^\d{5}$/, format: '12345' },
    };

    const countryPattern = patterns[country.toUpperCase()];
    if (!countryPattern) {
      return {
        isValid: false,
        normalizedCode: postalCode,
        country: country.toUpperCase(),
        format: 'Paese non supportato'
      };
    }

    const normalizedCode = postalCode.replace(/\s+/g, '').toUpperCase();
    const isValid = countryPattern.pattern.test(normalizedCode);

    return {
      isValid,
      normalizedCode: isValid ? normalizedCode : postalCode,
      country: country.toUpperCase(),
      format: countryPattern.format
    };
  }

  // ===========================
  // HELPER METHODS PRIVATI
  // ===========================

  private mapAddressToResponseDto(address: any): AddressResponseDto {
    return {
      id: address.id,
      name: address.name,
      street: address.street,
      city: address.city,
      postalCode: address.postalCode,
      province: address.province,
      provinceCode: address.provinceCode,
      country: address.country,
      phone: address.phone,
      company: address.company,
      vatNumber: address.vatNumber,
      isDefault: address.isDefault,
      type: address.type,
      notes: address.notes,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
      shippingInfo: {
        isSupported: this.isCountrySupported(address.country),
        estimatedDays: this.getEstimatedDeliveryDays(address.country),
        availableCarriers: this.getAvailableCarriers(address.country),
        restrictions: this.getShippingRestrictions(address.country),
        additionalCosts: 0,
      }
    };
  }

  private isCountrySupported(country: string): boolean {
    const supported = ['IT', 'FR', 'DE', 'ES', 'AT', 'BE', 'NL', 'PT', 'GR'];
    return supported.includes(country.toUpperCase());
  }

  private getEstimatedDeliveryDays(country: string): number {
    const deliveryTimes = {
      'IT': 2,
      'FR': 4,
      'DE': 4,
      'ES': 5,
      'AT': 4,
      'BE': 4,
      'NL': 4,
      'PT': 5,
      'GR': 6,
    };

    return deliveryTimes[country.toUpperCase()] || 7;
  }

  private getAvailableCarriers(country: string): string[] {
    if (this.isCountrySupported(country)) {
      return ['DHL', 'UPS', 'FedEx'];
    }
    return [];
  }

  private getShippingRestrictions(country: string): string[] {
    if (!this.isCountrySupported(country)) {
      return ['Paese non supportato per spedizione'];
    }
    return [];
  }
}