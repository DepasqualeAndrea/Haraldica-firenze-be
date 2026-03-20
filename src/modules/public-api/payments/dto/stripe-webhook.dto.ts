import { Expose, Transform, Type } from 'class-transformer';
import { IsString, IsOptional, IsObject, IsArray, IsBoolean, IsDate, IsEmail, IsEnum, IsNotEmpty, IsNumber, IsUrl, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, registerDecorator, ValidateNested } from 'class-validator';
import { PaymentStatus } from 'src/database/entities/payment.entity';

// ============= BASE DTOs (devono essere definiti per primi) =============

export class AddressDto {
  @IsString()
  @MaxLength(200)
  line1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsString()
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsString()
  @MaxLength(20)
  postalCode: string;

  @IsString()
  @Length(2, 2)
  country: string;
}

export class ShippingDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/)
  phone?: string;
}

export class TaxIdDto {
  @IsString()
  type: string;

  @IsString()
  value: string;
}

export class ShippingAddressDto extends AddressDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class BillingAddressDto extends AddressDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;
}

export class CustomFieldDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsEnum(['dropdown', 'numeric', 'text'])
  type: 'dropdown' | 'numeric' | 'text';

  @IsOptional()
  @IsBoolean()
  optional?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[]; // Per dropdown
}

export class PackageDimensionsDto {
  @IsNumber()
  @Min(0)
  height: number;

  @IsNumber()
  @Min(0)
  length: number;

  @IsNumber()
  @Min(0)
  weight: number;

  @IsNumber()
  @Min(0)
  width: number;
}

export class RecurringDto {
  @IsEnum(['day', 'week', 'month', 'year'])
  interval: 'day' | 'week' | 'month' | 'year';

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalCount?: number;

  @IsOptional()
  @IsEnum(['licensed', 'metered'])
  usageType?: 'licensed' | 'metered';

  @IsOptional()
  @IsEnum(['sum', 'last_during_period', 'last_ever', 'max'])
  aggregateUsage?: 'sum' | 'last_during_period' | 'last_ever' | 'max';
}

export class TierDto {
  @IsNumber()
  @Min(1)
  upTo: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flatAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitAmount?: number;
}

export class PromotionRestrictionsDto {
  @IsOptional()
  @IsBoolean()
  firstTimeTransaction?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumAmount?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  minimumAmountCurrency?: string;
}

export class RefundItemDto {
  @IsUUID()
  orderItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @MaxLength(200)
  reason: string;
}

export class SubscriptionItemDto {
  @IsString()
  priceId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class DisputeEvidenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerCommunication?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerEmailAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerSignature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  receipt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  refundPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  shippingCarrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  shippingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  shippingDocumentation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  shippingTrackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  uncategorizedFile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  uncategorizedText?: string;
}

// ============= QUERY DTOs =============

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class DateRangeDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class StripeListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  endingBefore?: string;

  @IsOptional()
  @IsString()
  startingAfter?: string;
}

// ============= WEBHOOK DTOs =============

export class StripeWebhookDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  data: any;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class WebhookEventDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  data: any;

  @IsNumber()
  created: number;

  @IsBoolean()
  livemode: boolean;

  @IsOptional()
  @IsNumber()
  pendingWebhooks?: number;

  @IsOptional()
  @IsString()
  request?: string;

  @IsOptional()
  @IsString()
  apiVersion?: string;
}

export class WebhookResponseDto {
  @Expose()
  received: boolean;

  @Expose()
  eventId: string;

  @Expose()
  eventType: string;

  @Expose()
  processingTimeMs: number;

  @Expose()
  retryCount?: number;

  @Expose()
  requestId: string;

  @Expose()
  timestamp: string;

  @Expose()
  errorType?: 'temporary' | 'permanent';

  @Expose()
  message?: string;
}

export class WebhookTestResponseDto {
  @Expose()
  success: boolean;

  @Expose()
  eventsSent: string[];

  @Expose()
  errors: string[];

  @Expose()
  endpointUrl: string;

  @Expose()
  timestamp: string;
}

export class WebhookErrorDto {
  @Expose()
  error: string;

  @Expose()
  errorType: 'temporary' | 'permanent';

  @Expose()
  message: string;

  @Expose()
  eventId?: string;

  @Expose()
  eventType?: string;

  @Expose()
  requestId: string;

  @Expose()
  timestamp: string;

  @Expose()
  retryAfter?: number;

  @Expose()
  retryCount?: number;
}

// ============= CHECKOUT SESSION DTOs =============

export class CreateCheckoutSessionDto {
  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsOptional()
  @IsString()
  promotionalCode?: string;

  @IsOptional()
  @IsString()
  giftCardCode?: string;

  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @IsOptional()
  @IsUrl()
  cancelUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BillingAddressDto)
  billingAddress?: BillingAddressDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethodTypes?: string[];

  @IsOptional()
  @IsBoolean()
  allowPromotionCodes?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDto)
  customFields?: CustomFieldDto[];
}

export class CheckoutSessionResponseDto {
  @Expose()
  sessionId: string;

  @Expose()
  url: string;

  @Expose()
  expiresAt: Date;

  @Expose()
  estimatedTaxes: number;

  @Expose()
  paymentMethods: string[];

  @Expose()
  orderId: string;

  @Expose()
  orderNumber: string;
}

// ============= PAYMENT METHOD DTOs =============

export class SavePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

export class PaymentMethodResponseDto {
  @Expose()
  id: string;

  @Expose()
  type: string;

  @Expose()
  @Transform(({ obj }) => obj.card)
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };

  @Expose()
  isDefault: boolean;

  @Expose()
  created: number;
}

export class CreateSetupIntentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethodTypes?: string[];

  @IsOptional()
  @IsEnum(['on_session', 'off_session'])
  usage?: 'on_session' | 'off_session';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @IsOptional()
  @IsString()
  platform?: string; // mobile, web, etc.
}

export class SetupIntentResponseDto {
  @Expose()
  setupIntentId: string;

  @Expose()
  clientSecret: string;

  @Expose()
  @IsOptional()
  ephemeralKey?: string;
}

// ============= REFUND DTOs =============

export class CreateAdvancedRefundDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  paymentIntentId?: string;

  @IsOptional()
  @IsString()
  chargeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsEnum(['duplicate', 'fraudulent', 'requested_by_customer', 'return', 'defective_product'])
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'return' | 'defective_product';

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  refundItems?: RefundItemDto[];

  @IsOptional()
  @IsBoolean()
  restoreStock?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNotes?: string;

  @IsOptional()
  @IsEmail()
  instructionsEmail?: string;
}

export class RefundResponseDto {
  @Expose()
  refundId: string;

  @Expose()
  refundAmount: number;

  @Expose()
  stockRestored: boolean;

  @Expose()
  notificationSent: boolean;

  @Expose()
  orderStatus: string;

  @Expose()
  estimatedArrival: string;

  @Expose()
  isFullRefund: boolean;
}

// ============= SUBSCRIPTION DTOs =============

export class CreateSubscriptionDto {
  @IsString()
  customerId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriptionItemDto)
  items: SubscriptionItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  trialPeriodDays?: number;

  @IsOptional()
  @IsString()
  defaultPaymentMethod?: string;

  @IsOptional()
  @IsEnum(['charge_automatically', 'send_invoice'])
  collectionMethod?: 'charge_automatically' | 'send_invoice';

  @IsOptional()
  @IsString()
  coupon?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriptionItemDto)
  items?: SubscriptionItemDto[];

  @IsOptional()
  @IsString()
  defaultPaymentMethod?: string;

  @IsOptional()
  @IsEnum(['create_prorations', 'none', 'always_invoice'])
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class CancelSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;
}

// ============= COUPON & PROMOTION DTOs =============

export class StripeCreateCouponDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  id?: string;

  @IsEnum(['forever', 'once', 'repeating'])
  duration: 'forever' | 'once' | 'repeating';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountOff?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationInMonths?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  redeemBy?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProducts?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class CreatePromotionCodeDto {
  @IsString()
  couponId: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  @MinLength(3)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiresAt?: Date;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionRestrictionsDto)
  restrictions?: PromotionRestrictionsDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class StripeCouponResponseDto {
  @Expose()
  id: string;

  @Expose()
  duration: string;

  @Expose()
  amountOff?: number;

  @Expose()
  percentOff?: number;

  @Expose()
  currency?: string;

  @Expose()
  name?: string;

  @Expose()
  valid: boolean;

  @Expose()
  timesRedeemed: number;

  @Expose()
  maxRedemptions?: number;

  @Expose()
  redeemBy?: Date;

  @Expose()
  created: Date;
}

// ============= ANALYTICS & REPORTING DTOs =============

export class PaymentMethodStatsDto {
  @Expose()
  method: string;

  @Expose()
  count: number;

  @Expose()
  revenue: number;

  @Expose()
  percentage: number;
}

export class RevenueByPeriodDto {
  @Expose()
  date: string;

  @Expose()
  revenue: number;

  @Expose()
  transactions: number;

  @Expose()
  averageValue: number;
}

export class FailureReasonDto {
  @Expose()
  reason: string;

  @Expose()
  count: number;

  @Expose()
  percentage: number;
}

export class RefundStatsDto {
  @Expose()
  totalRefunded: number;

  @Expose()
  refundCount: number;

  @Expose()
  averageRefundAmount: number;

  @Expose()
  topRefundReasons: Array<{
    reason: string;
    count: number;
    amount: number;
  }>;
}

export class PaymentInsightsFilterDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PaymentStatus, { each: true })
  status?: PaymentStatus[];

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}

export class PaymentInsightsResponseDto {
  @Expose()
  totalRevenue: number;

  @Expose()
  totalTransactions: number;

  @Expose()
  averageTransactionValue: number;

  @Expose()
  successRate: number;

  @Expose()
  refundRate: number;

  @Expose()
  @Type(() => PaymentMethodStatsDto)
  topPaymentMethods: PaymentMethodStatsDto[];

  @Expose()
  @Type(() => RevenueByPeriodDto)
  revenueByPeriod: RevenueByPeriodDto[];

  @Expose()
  @Type(() => FailureReasonDto)
  failureReasons: FailureReasonDto[];

  @Expose()
  @Type(() => RefundStatsDto)
  refundStats: RefundStatsDto;
}

// ============= DISPUTE DTOs =============

export class UpdateDisputeDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DisputeEvidenceDto)
  evidence?: DisputeEvidenceDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class DisputeResponseDto {
  @Expose()
  id: string;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  reason: string;

  @Expose()
  status: string;

  @Expose()
  created: Date;

  @Expose()
  evidenceDueBy: Date;

  @Expose()
  isChargeRefundable: boolean;

  @Expose()
  chargeId: string;

  @Expose()
  paymentIntentId?: string;
}

// ============= PRODUCT & PRICE DTOs =============

export class CreateStripeProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  name: string;

  @IsString()
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  taxCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PackageDimensionsDto)
  packageDimensions?: PackageDimensionsDto;

  @IsOptional()
  @IsBoolean()
  shippable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitLabel?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class CreateStripePriceDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsEnum(['inclusive', 'exclusive'])
  taxBehavior?: 'inclusive' | 'exclusive';

  @IsOptional()
  @IsEnum(['per_unit', 'tiered'])
  billingScheme?: 'per_unit' | 'tiered';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringDto)
  recurring?: RecurringDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  tiers?: TierDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

// ============= CUSTOMER DTOs =============

export class CreateStripeCustomerDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping?: ShippingDto;

  @IsOptional()
  @IsEnum(['none', 'exempt', 'reverse'])
  taxExempt?: 'none' | 'exempt' | 'reverse';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxIdDto)
  taxIds?: TaxIdDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

// ============= BALANCE & PAYOUT DTOs =============

export class BalanceTransactionFilterDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  availableOnGte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  availableOnLte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdGte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdLte?: Date;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PayoutFilterDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  arrivalDateGte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  arrivalDateLte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdGte?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  createdLte?: Date;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsEnum(['paid', 'pending', 'in_transit', 'canceled', 'failed'])
  status?: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ============= HEALTH CHECK DTOs =============

export class StripeHealthCheckResponseDto {
  @Expose()
  status: 'healthy' | 'unhealthy';

  @Expose()
  apiVersion: string;

  @Expose()
  testMode: boolean;

  @Expose()
  balanceAvailable: boolean;

  @Expose()
  webhooksConfigured: boolean;

  @Expose()
  lastCheck: string;

  @Expose()
  cacheStats?: {
    size: number;
    keys: string[];
  };
}

// ============= ERROR DTOs =============

export class StripeErrorDto {
  @Expose()
  type: string;

  @Expose()
  code?: string;

  @Expose()
  message: string;

  @Expose()
  param?: string;

  @Expose()
  declineCode?: string;

  @Expose()
  chargeId?: string;

  @Expose()
  paymentIntentId?: string;

  @Expose()
  paymentMethodId?: string;

  @Expose()
  setupIntentId?: string;

  @Expose()
  sourceId?: string;
}

// ============= VALIDATION DECORATORS PERSONALIZZATI =============

export function IsValidCouponCode() {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidCouponCode',
      target: object.constructor,
      propertyName: propertyName,
      validator: {
        validate(value: any) {
          if (!value) return true; // Optional field
          return /^[A-Z0-9_-]{3,50}$/.test(value);
        },
        defaultMessage() {
          return 'Coupon code must be 3-50 characters, uppercase letters, numbers, underscores and hyphens only';
        },
      },
    });
  };
}

export function IsValidMetadata() {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidMetadata',
      target: object.constructor,
      propertyName: propertyName,
      validator: {
        validate(value: any) {
          if (!value) return true;
          if (typeof value !== 'object') return false;
          
          const keys = Object.keys(value);
          if (keys.length > 50) return false; // Stripe limit
          
          return keys.every(key => 
            key.length <= 40 && // Stripe limit
            typeof value[key] === 'string' &&
            value[key].length <= 500 // Stripe limit
          );
        },
        defaultMessage() {
          return 'Metadata must be an object with max 50 keys, each key max 40 chars, each value max 500 chars';
        },
      },
    });
  };
}

export function IsValidStripeAmount() {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidStripeAmount',
      target: object.constructor,
      propertyName: propertyName,
      validator: {
        validate(value: any) {
          if (!value) return true;
          if (typeof value !== 'number') return false;
          
          // Stripe limits: min 0.50 EUR, max 999999.99 EUR
          return value >= 0.50 && value <= 999999.99;
        },
        defaultMessage() {
          return 'Amount must be between 0.50 and 999999.99 EUR';
        },
      },
    });
  };
}

// ============= TRANSFORM DECORATORS =============

export function ToStripeAmount() {
  return Transform(({ value }) => {
    if (typeof value === 'number') {
      return Math.round(value * 100); // Convert to cents
    }
    return value;
  });
}

export function FromStripeAmount() {
  return Transform(({ value }) => {
    if (typeof value === 'number') {
      return Math.round(value) / 100; // Convert from cents
    }
    return value;
  });
}

export function ToUpperCase() {
  return Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  });
}