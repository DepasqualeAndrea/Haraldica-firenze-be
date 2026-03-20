// src/modules/public-api/orders/dto/order.dto.ts

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
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() company?: string;
  @IsString() @IsOptional() vatNumber?: string;
  @IsBoolean() @IsOptional() saveAddress?: boolean;

  getFullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
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
  @IsOptional() @IsString() userType?: 'guest' | 'customer';  // ✅ CAMBIATO da 'registered'
  @IsOptional() @IsUUID() userId?: string;  // ✅ OBBLIGATORIO per tutti
}

export class OrderFilterDto {
  @ApiPropertyOptional({ enum: OrderStatus }) 
  @IsOptional() 
  @IsEnum(OrderStatus) 
  status?: OrderStatus;
  
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() 
  userId?: string;
  
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() 
  orderNumber?: string;
  
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsDateString() 
  startDate?: string;
  
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsDateString() 
  endDate?: string;
  
  @ApiPropertyOptional({ minimum: 0 }) 
  @IsOptional() 
  @IsNumber() 
  @Min(0) 
  minAmount?: number;
  
  @ApiPropertyOptional({ minimum: 0 }) 
  @IsOptional() 
  @IsNumber() 
  @Min(0) 
  maxAmount?: number;
  
  @ApiPropertyOptional({ minimum: 1 }) 
  @IsOptional() 
  @IsNumber() 
  @Min(1) 
  page?: number = 1;
  
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) 
  @IsOptional() 
  @IsNumber() 
  @Min(1) 
  @Max(100) 
  limit?: number = 20;
  
  @ApiPropertyOptional({ enum: ['createdAt', 'total', 'orderNumber'] }) 
  @IsOptional() 
  @IsEnum(['createdAt', 'total', 'orderNumber']) 
  sortBy?: 'createdAt' | 'total' | 'orderNumber' = 'createdAt';
  
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] }) 
  @IsOptional() 
  @IsEnum(['ASC', 'DESC']) 
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class OrderResponseDto {
  @ApiProperty() @Expose() id: string;
  @ApiProperty() @Expose() orderNumber: string;
  @ApiPropertyOptional() @Expose() userId?: string;
  @ApiPropertyOptional() @Expose() customerEmail?: string;
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
  @ApiProperty() @Expose() createdAt: Date;
  @ApiProperty() @Expose() updatedAt: Date;
}