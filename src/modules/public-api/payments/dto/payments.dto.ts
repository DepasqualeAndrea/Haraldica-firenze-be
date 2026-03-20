import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

// ========== Payment Intents (lean) ==========
export class CreatePaymentIntentDto {
  @ApiPropertyOptional({ description: 'ID ordine: se presente, l’importo viene letto dall’ordine' })
  @IsOptional() @IsUUID() orderId?: string;

  @ApiPropertyOptional({ description: 'Importo in EUR (opzionale se si usa orderId)' })
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;

  @ApiPropertyOptional({ description: 'Valuta, default EUR' })
  @IsOptional() @IsString() @MaxLength(10) currency?: string;

  @ApiPropertyOptional({ description: 'Stripe customer ID opzionale' })
  @IsOptional() @IsString() @MaxLength(128) customerId?: string;

  @ApiPropertyOptional({ description: 'Email per ricevuta (fallback: customerEmail dell’ordine)' })
  @IsOptional() @IsEmail() receiptEmail?: string;

  @ApiPropertyOptional({ description: 'Chiave di idempotenza per evitare PI duplicati' })
  @IsOptional() @IsString() @MaxLength(128) idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Metadata aggiuntivo' })
  @IsOptional() @IsObject() metadata?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Pass-through per APM automatici' })
  @IsOptional() @IsObject() automatic_payment_methods?: { enabled: boolean };
}

export class CreateRefundDto {
  @IsOptional() @IsString() paymentIntentId?: string;
  @IsOptional() @IsString() chargeId?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsEnum(['duplicate', 'fraudulent', 'requested_by_customer']) reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  @IsOptional() metadata?: Record<string, string>;
}


// ========== Payment Methods (keep minimal saving via SetupIntent) ==========
export class SavePaymentMethodDto {
  @IsString() @IsNotEmpty() paymentMethodId: string;
  @IsOptional() @IsBoolean() setAsDefault?: boolean;
}

export class PaymentMethodResponseDto {
  @Expose() id: string;
  @Expose() type: string;
  @Expose() card?: { brand: string; last4: string; exp_month: number; exp_year: number; };
  @Expose() isDefault: boolean;
  @Expose() created: number;
}

export class CreateSetupIntentDto {
  @IsOptional() @IsArray() @IsString({ each: true }) paymentMethodTypes?: string[];
  @IsOptional() @IsEnum(['on_session', 'off_session']) usage?: 'on_session' | 'off_session';
  @IsOptional() @IsObject() metadata?: Record<string, string>;
  @IsOptional() @IsString() platform?: string; // mobile, web, etc.
}

export class SetupIntentResponseDto {
  @Expose() setupIntentId: string;
  @Expose() clientSecret: string;
  @Expose() @IsOptional() ephemeralKey?: string;
}

// ========== Webhook ack (lean) ==========
export class WebhookAckDto {
  @Expose() received: boolean;
  @Expose() eventId: string;
  @Expose() eventType: string;
  @Expose() processingTimeMs: number;
  @Expose() requestId: string;
  @Expose() timestamp: string;
  @Expose() message?: string;
}