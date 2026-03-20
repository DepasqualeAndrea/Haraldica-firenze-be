import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
  Max,
  IsInt,
  IsObject,
} from 'class-validator';
import { OrderStatus, OrderType } from 'src/database/entities/order.entity';

export class AddressDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() streetName: string;
  @IsString() @IsOptional() streetNumber?: string;
  @IsString() @IsOptional() addressLine2?: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() @IsNotEmpty() postalCode: string;
  @IsString() @IsNotEmpty() provinceCode: string;
  @IsString() @IsNotEmpty() countryCode: string;
  // @IsString() @IsNotEmpty() civicNumber: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() company?: string;
  @IsString() @IsOptional() vatNumber?: string;
  @IsBoolean() @IsOptional() saveAddress?: boolean;
  @IsBoolean() @IsOptional() default?: boolean;

  getFullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  getProvinceName(): string {
    const code = this.provinceCode?.toUpperCase();

    // Mappa province italiane (codice → nome)
    const PROVINCE_MAP: Record<string, string> = {
      'AG': 'Agrigento', 'AL': 'Alessandria', 'AN': 'Ancona', 'AO': 'Aosta',
      'AP': 'Ascoli Piceno', 'AQ': "L'Aquila", 'AR': 'Arezzo', 'AT': 'Asti',
      'AV': 'Avellino', 'BA': 'Bari', 'BG': 'Bergamo', 'BI': 'Biella',
      'BL': 'Belluno', 'BN': 'Benevento', 'BO': 'Bologna', 'BR': 'Brindisi',
      'BS': 'Brescia', 'BT': 'Barletta-Andria-Trani', 'BZ': 'Bolzano',
      'CA': 'Cagliari', 'CB': 'Campobasso', 'CE': 'Caserta', 'CH': 'Chieti',
      'CL': 'Caltanissetta', 'CN': 'Cuneo', 'CO': 'Como', 'CR': 'Cremona',
      'CS': 'Cosenza', 'CT': 'Catania', 'CZ': 'Catanzaro', 'EN': 'Enna',
      'FC': 'Forlì-Cesena', 'FE': 'Ferrara', 'FG': 'Foggia', 'FI': 'Firenze',
      'FM': 'Fermo', 'FR': 'Frosinone', 'GE': 'Genova', 'GO': 'Gorizia',
      'GR': 'Grosseto', 'IM': 'Imperia', 'IS': 'Isernia', 'KR': 'Crotone',
      'LC': 'Lecco', 'LE': 'Lecce', 'LI': 'Livorno', 'LO': 'Lodi',
      'LT': 'Latina', 'LU': 'Lucca', 'MB': 'Monza e Brianza', 'MC': 'Macerata',
      'ME': 'Messina', 'MI': 'Milano', 'MN': 'Mantova', 'MO': 'Modena',
      'MS': 'Massa-Carrara', 'MT': 'Matera', 'NA': 'Napoli', 'NO': 'Novara',
      'NU': 'Nuoro', 'OR': 'Oristano', 'PA': 'Palermo', 'PC': 'Piacenza',
      'PD': 'Padova', 'PE': 'Pescara', 'PG': 'Perugia', 'PI': 'Pisa',
      'PN': 'Pordenone', 'PO': 'Prato', 'PR': 'Parma', 'PT': 'Pistoia',
      'PU': 'Pesaro e Urbino', 'PV': 'Pavia', 'PZ': 'Potenza', 'RA': 'Ravenna',
      'RC': 'Reggio Calabria', 'RE': 'Reggio Emilia', 'RG': 'Ragusa',
      'RI': 'Rieti', 'RM': 'Roma', 'RN': 'Rimini', 'RO': 'Rovigo',
      'SA': 'Salerno', 'SI': 'Siena', 'SO': 'Sondrio', 'SP': 'La Spezia',
      'SR': 'Siracusa', 'SS': 'Sassari', 'SU': 'Sud Sardegna', 'SV': 'Savona',
      'TA': 'Taranto', 'TE': 'Teramo', 'TN': 'Trento', 'TO': 'Torino',
      'TP': 'Trapani', 'TR': 'Terni', 'TS': 'Trieste', 'TV': 'Treviso',
      'UD': 'Udine', 'VA': 'Varese', 'VB': 'Verbano-Cusio-Ossola',
      'VC': 'Vercelli', 'VE': 'Venezia', 'VI': 'Vicenza', 'VR': 'Verona',
      'VT': 'Viterbo', 'VV': 'Vibo Valentia',
    };

    return PROVINCE_MAP[code] || code;
  }

  getFullStreet(): string {
    let street = this.streetName;
    if (this.streetNumber) {
      street += `, ${this.streetNumber}`;
    }
    if (this.addressLine2) {
      street += ` (${this.addressLine2})`;
    }
    return street;
  }

  toLegacyFormat(): {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    province: string;
    provinceCode: string;
    // civicNumber: string; 
    phone?: string;
    company?: string;
    vatNumber?: string;
  } {
    return {
      name: this.getFullName(),
      street: this.getFullStreet(),
      city: this.city,
      postalCode: this.postalCode,
      country: this.countryCode,
      province: this.getProvinceName(),
      provinceCode: this.provinceCode,
      // civicNumber: this.civicNumber,         
      phone: this.phone,
      company: this.company,
      vatNumber: this.vatNumber,
    };
  }
}

export class CheckoutDto {
  @ValidateNested() @Type(() => AddressDto) shippingAddress: AddressDto;
  @ValidateNested() @Type(() => AddressDto) @IsOptional() billingAddress?: AddressDto;
  @IsString() @IsOptional() notes?: string;
  @IsString() @IsOptional() couponCode?: string;
  @IsEmail() @IsOptional() customerEmail?: string;
  @IsBoolean() @IsOptional() acceptsMarketing?: boolean;
  @IsBoolean() @IsOptional() acceptsTerms?: boolean;
  @ApiPropertyOptional({ description: 'Richiede fattura per questo ordine' })
  @IsOptional()
  @IsBoolean()
  invoiceRequested?: boolean;
}

export class CreateOrderAddressDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() street: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiProperty() @IsString() @IsNotEmpty() postalCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() country: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class OrderBillingAddressDto extends CreateOrderAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) vatNumber?: string;
}

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch {
        return [];
      }
    }
    if (typeof value === 'object') return [value];
    return [];
  })
  @IsArray({ message: 'items must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ type: CreateOrderAddressDto })
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return undefined; }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => CreateOrderAddressDto)
  shippingAddress: CreateOrderAddressDto;

  @ApiPropertyOptional({ type: CreateOrderAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderAddressDto)
  billingAddress?: CreateOrderAddressDto;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerEmail?: string;
}
export class CreateOrderFromCartDto {
  @IsNotEmpty()
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    phone?: string;
    company?: string;
    vatNumber?: string;
  };

  @IsOptional()
  billingAddress?: {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    phone?: string;
    company?: string;
    vatNumber?: string;
  };

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() userType?: 'guest' | 'customer';
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsBoolean() invoiceRequested?: boolean;
}

export class CreateOrderRequest {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Indirizzo di spedizione' })
  @IsOptional()
  shippingAddress?: any;
}

export class OrderFilterDto {
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsNumber() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number = 20;
  @ApiPropertyOptional({ enum: ['createdAt', 'total', 'orderNumber'] }) @IsOptional() @IsEnum(['createdAt', 'total', 'orderNumber']) sortBy?: 'createdAt' | 'total' | 'orderNumber' = 'createdAt';
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] }) @IsOptional() @IsEnum(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() trackingNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) notes?: string;
}
export class UpdateOrderDto {
  @ApiPropertyOptional({ type: CreateOrderAddressDto }) @IsOptional() @ValidateNested() @Type(() => CreateOrderAddressDto) shippingAddress?: CreateOrderAddressDto;
  @ApiPropertyOptional({ type: OrderBillingAddressDto }) @IsOptional() @ValidateNested() @Type(() => OrderBillingAddressDto) billingAddress?: OrderBillingAddressDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trackingNumber?: string;
}

export class OrderItemResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() productName: string;
  @ApiProperty() @Expose() productSku: string;
  @ApiProperty() @Expose() unitPrice: number;
  @ApiProperty() @Expose() quantity: number;
  @ApiProperty() @Expose() total: number;
}

export class OrderResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() orderNumber: string;
  @ApiPropertyOptional() @Expose() userId?: string;
  @ApiPropertyOptional() @Expose() customerEmail?: string;
  @ApiPropertyOptional() @Expose() sessionId?: string;
  @ApiPropertyOptional({ enum: OrderType }) @Expose() orderType?: OrderType;
  @ApiProperty() @Expose() status: OrderStatus;
  @ApiProperty() @Expose() subtotal: number;
  @ApiProperty() @Expose() shippingCost: number;
  @ApiProperty() @Expose() discountAmount: number;
  @ApiProperty() @Expose() total: number;
  @ApiProperty() @Expose() shippingAddress: any;
  @ApiPropertyOptional() @Expose() billingAddress?: any;
  @ApiPropertyOptional() @Expose() notes?: string;
  @ApiPropertyOptional() @Expose() trackingNumber?: string;
  @ApiPropertyOptional() @Expose() couponCode?: string;
  @ApiProperty({ type: [OrderItemResponseDto] }) @Expose() @Type(() => OrderItemResponseDto) items: OrderItemResponseDto[];
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;
  @ApiProperty() @Expose() get isCancellable(): boolean { return this.status === OrderStatus.PENDING || this.status === OrderStatus.CONFIRMED; }
  @ApiProperty() @Expose() get canBeShipped(): boolean { return this.status === OrderStatus.CONFIRMED || this.status === OrderStatus.PROCESSING; }
  @ApiProperty() @Expose() get isDelivered(): boolean { return this.status === OrderStatus.DELIVERED; }
  @ApiProperty() @Expose() get totalItems(): number { return this.items.reduce((sum, item) => sum + item.quantity, 0); }
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] }) @Expose() @Type(() => OrderResponseDto) orders: OrderResponseDto[];
  @ApiProperty() @Expose() total: number;
  @ApiProperty() @Expose() page: number;
  @ApiProperty() @Expose() limit: number;
  @ApiProperty() @Expose() totalPages: number;
  @ApiProperty() @Expose() hasNext: boolean;
  @ApiProperty() @Expose() hasPrev: boolean;
}
