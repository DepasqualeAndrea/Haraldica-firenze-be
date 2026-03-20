import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly cache = new Map<string, any>();

  constructor(private configService: ConfigService) {
    const config = this.configService.get('stripe');

    if (!config?.secretKey) {
      throw new Error('❌ Stripe configuration is missing');
    }

    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
      timeout: config.config?.timeout || 15000,
      maxNetworkRetries: config.config?.maxNetworkRetries || 3,
      telemetry: config.config?.telemetry ?? false,
      typescript: true,
    });

    const mode = config.secretKey.startsWith('sk_test') ? 'Test' : 'Production';
    this.logger.log(`✅ Stripe inizializzato - ${mode} mode - API Version: ${config.apiVersion}`);
  }

  // ============= CHECKOUT SESSIONS AVANZATE =============

  async createCheckoutSession(sessionData: {
    customer?: string;
    customer_email?: string;
    line_items: Array<{
      price_id?: string;
      price_data?: {
        currency: string;
        product_data: {
          name: string;
          description?: string;
          metadata?: Record<string, string>;
          tax_code?: string;
          images?: string[];
        };
        unit_amount: number;
        tax_behavior?: 'inclusive' | 'exclusive';
        recurring?: {
          interval: 'day' | 'week' | 'month' | 'year';
          interval_count?: number;
        };
      };
      quantity: number;
      adjustable_quantity?: {
        enabled: boolean;
        minimum?: number;
        maximum?: number;
      };
    }>;
    mode: 'payment' | 'subscription' | 'setup';
    success_url: string;
    cancel_url: string;
    automatic_tax?: { enabled: boolean };
    billing_address_collection?: 'auto' | 'required';
    shipping_address_collection?: {
      allowed_countries: string[];
    };
    shipping_options?: Stripe.Checkout.SessionCreateParams.ShippingOption[];
    tax_id_collection?: { enabled: boolean };
    metadata?: Record<string, string>;
    locale?: string;
    expires_at?: number;
    customer_creation?: 'always' | 'if_required';
    payment_method_types?: string[];
    allow_promotion_codes?: boolean;
    discounts?: Array<{
      coupon?: string;
      promotion_code?: string;
    }>;
    customer_update?: {
      address?: 'auto' | 'never';
      name?: 'auto' | 'never';
      shipping?: 'auto' | 'never';
    };
    phone_number_collection?: {
      enabled: boolean;
    };
    custom_fields?: Array<{
      key: string;
      label: {
        custom: string;
        type: 'custom';
      };
      type: 'dropdown' | 'numeric' | 'text';
      optional?: boolean;
    }>;
    invoice_creation?: {
      enabled: boolean;
      invoice_data?: {
        description?: string;
        metadata?: Record<string, string>;
        custom_fields?: Array<{
          name: string;
          value: string;
        }>;
      };
    };
  }): Promise<Stripe.Checkout.Session> {
    if (!sessionData.line_items || sessionData.line_items.length === 0) {
      const errorMessage = "Impossibile creare una sessione Stripe senza 'line_items'.";
      this.logger.error(errorMessage, { customer: sessionData.customer });
      throw new Error(errorMessage);
    }

    try {
      const session = await this.stripe.checkout.sessions.create(<Stripe.Checkout.SessionCreateParams>{
        ...(sessionData.customer ? { customer: sessionData.customer } : {}),
        customer_email: sessionData.customer_email,

        line_items: sessionData.line_items.map(item => {
          const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
            quantity: item.quantity,
          };

          if (item.price_id) {
            lineItem.price = item.price_id;
          } else if (item.price_data) {
            lineItem.price_data = {
              ...item.price_data,
              tax_behavior: 'inclusive', // IMPOSTA IMPOSTE INCLUSE
              ...(item.price_data.product_data && {
                product_data: {
                  ...item.price_data.product_data,
                  tax_code: this.getTaxCodeForClothing(item.price_data.product_data.metadata?.clothingType),
                }
              })
            };
          }

          if (item.adjustable_quantity) {
            lineItem.adjustable_quantity = item.adjustable_quantity;
          }

          return lineItem;
        }),

        mode: sessionData.mode,
        success_url: sessionData.success_url,
        cancel_url: sessionData.cancel_url,

        ...(sessionData.customer
          ? {}
          : { customer_creation: sessionData.customer_creation || 'if_required' }
        ),

        ...(sessionData.automatic_tax ? { automatic_tax: sessionData.automatic_tax } : {}),
        tax_id_collection: sessionData.tax_id_collection || { enabled: true },
        billing_address_collection: sessionData.billing_address_collection || 'required',
        shipping_address_collection: sessionData.shipping_address_collection,
        shipping_options: sessionData.shipping_options,
        payment_method_types: sessionData.payment_method_types || ['card'],
        allow_promotion_codes: sessionData.allow_promotion_codes ?? true,
        discounts: sessionData.discounts,
        locale: sessionData.locale as Stripe.Checkout.SessionCreateParams.Locale || 'it',
        metadata: sessionData.metadata || {},
        expires_at: sessionData.expires_at,
        customer_update: sessionData.customer ? sessionData.customer_update || {
          address: 'auto',
          name: 'auto',
          shipping: 'auto',
        } : undefined, // ✅ customer_update solo se hai customer
        phone_number_collection: sessionData.phone_number_collection,
        custom_fields: sessionData.custom_fields,
        invoice_creation: sessionData.invoice_creation,

        ...(sessionData.mode === 'subscription' && {
          subscription_data: {
            trial_period_days: 14,
            metadata: sessionData.metadata,
          },
        }),
      } as Stripe.Checkout.SessionCreateParams);

      this.logger.log(`✅ Checkout Session creato: ${session.id} - Mode: ${sessionData.mode}`);
      return session;
    } catch (error) {
      this.logger.error(`❌ Errore creazione Checkout Session:`, error);
      throw error;
    }
  }

  private getTaxCodeForClothing(clothingType?: string): string {
    const clothingTaxCodes: Record<string, string> = {
      'shoes': 'txcd_99999999',   // Footwear
      'belts': 'txcd_99999999',   // Accessories
      'accessories': 'txcd_99999999',
      'shirts': 'txcd_33040000',  // Clothing generic
      'coats': 'txcd_33040000',
      'cashmere': 'txcd_33040000',
    };

    return clothingTaxCodes[clothingType ?? ''] ?? 'txcd_33040000';
  }

  async retrieveCheckoutSession(sessionId: string, expand?: string[]): Promise<Stripe.Checkout.Session> {
    try {
      // Cache check
      const cacheKey = `session_${sessionId}_${(expand || []).join(',')}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: expand || [
          'customer',
          'line_items',
          'line_items.data.price.product',
          'payment_intent',
          'subscription',
          'invoice',
          'total_details.breakdown',
        ],
      });

      // Cache per 5 minuti
      this.cache.set(cacheKey, session);
      setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

      this.logger.debug(`📋 Checkout Session recuperato: ${sessionId}`);
      return session;
    } catch (error) {
      this.logger.error(`❌ Errore recupero Checkout Session: ${sessionId}`, error);
      throw error;
    }
  }

  async expireCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.expire(sessionId);
      this.logger.log(`⏰ Checkout Session scaduto: ${sessionId}`);
      return session;
    } catch (error) {
      this.logger.error(`❌ Errore scadenza Checkout Session: ${sessionId}`, error);
      throw error;
    }
  }

  async createAdvancedPaymentIntent(args: {
    amount: number; currency: string; customer: string;
    paymentMethodTypes?: string[]; metadata?: Record<string, string>;
    automaticPaymentMethods?: boolean; captureMethod?: 'automatic' | 'manual';
    setupFutureUsage?: 'off_session' | 'on_session'; idempotencyKey?: string;
    automaticTax?: boolean;
  }) {
    const stripe = this.getStripeInstance();
    // NB: Se amount dev’essere in cents, moltiplica qui.
    const res = await stripe.paymentIntents.create({
      amount: Math.round(args.amount * 100),
      currency: args.currency,
      customer: args.customer,
      payment_method_types: args.paymentMethodTypes,
      metadata: args.metadata,
      automatic_payment_methods: args.automaticPaymentMethods ? { enabled: true } : undefined,
      automatic_tax: args.automaticTax ? { enabled: true } : undefined,
      capture_method: args.captureMethod,
      setup_future_usage: args.setupFutureUsage,
    } as any, args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined);
    return res;
  }

  // async createEphemeralKey(customerId: string): Promise<Stripe.EphemeralKey> {
  //   try {
  //     const ephemeralKey = await this.stripe.ephemeralKeys.create(
  //       { customer: customerId },
  //       { apiVersion: '2024-11-20.acacia' }
  //     );

  //     this.logger.log(`🔑 Ephemeral Key creato per customer: ${customerId}`);
  //     return ephemeralKey;
  //   } catch (error) {
  //     this.logger.error(`❌ Errore creazione Ephemeral Key per ${customerId}`, error);
  //     throw error;
  //   }
  // }

  // ============= METODO PER CONFIGURAZIONE ELEMENTS =============

  getElementsConfiguration(clientSecret: string): {
    clientSecret: string;
    appearance: any;
    locale: string;
  } {
    return {
      clientSecret,
      locale: 'it',
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#C5A352',
          colorBackground: '#ffffff',
          colorText: '#2C2C2C',
          colorDanger: '#dc2626',
          fontFamily: '"Lora", serif',
          spacingUnit: '4px',
          borderRadius: '8px',
        },
        rules: {
          '.Tab': {
            border: '1px solid #e0e0e0',
            borderRadius: '999px',
            padding: '10px 18px',
            backgroundColor: '#ffffff',
            color: '#2C2C2C',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
          },
          '.Tab:hover': {
            borderColor: '#C5A352',
            backgroundColor: '#FAF8F3',
          },
          '.Tab--selected': {
            backgroundColor: '#cfc9bbbb',
            color: '#ffffff',
            borderColor: '#C5A352',
          },
          '.Input': {
            border: '1px solid #e7e7e7',
            borderRadius: '8px',
            fontSize: '15px',
            padding: '12px 14px',
            boxShadow: 'none',
          },
          '.Input:focus': {
            border: '1px solid #C5A352',
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(197, 163, 82, 0.1)',
          },
          '.Label': {
            fontSize: '13px',
            fontWeight: '600',
            color: '#5A5A5A',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
          '.Error': {
            color: '#dc2626',
            fontSize: '13px',
            marginTop: '6px',
          },
        },
      },
    };
  }

  // ============= GESTIONE PRODOTTI E PREZZI AVANZATA =============

  buildIdempotencyKey(parts: Record<string, any>): string {
    const raw = JSON.stringify(parts);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
    return `pi_init_${Math.abs(hash)}`;
  }

  async ensureCustomer(opts: { email?: string; name?: string; metadata?: Record<string, string> }) {
    // (NOTA: se vuoi riuso per email, aggiungi una query a list customers)
    const customer = await this.stripe.customers.create({
      email: opts.email,
      name: opts.name,
      metadata: opts.metadata,
    });
    this.logger.log(`✅ Cliente Stripe creato/ensure: ${customer.id} - ${opts.email}`);
    return customer;
  }

  async createPaymentIntentAutomatic(params: {
    amountInCents: number;
    currency: string;
    customer: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
    captureMethod?: 'automatic' | 'manual';
    setupFutureUsage?: 'off_session' | 'on_session';
    automaticTax?: boolean;
  }) {
    const data: Stripe.PaymentIntentCreateParams = {
      amount: params.amountInCents,
      currency: params.currency,
      customer: params.customer,
      automatic_payment_methods: { enabled: true }, // ← Modalità automatica
      metadata: params.metadata,
      automatic_tax: params.automaticTax ? { enabled: true } : undefined,
      capture_method: params.captureMethod || 'automatic',
      setup_future_usage: params.setupFutureUsage || 'off_session',
    } as any;

    const pi = await this.stripe.paymentIntents.create(
      data,
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );

    this.logger.log(`✅ PaymentIntent creato (automatic): ${pi.id} amount=${(pi.amount / 100).toFixed(2)} ${pi.currency}`);
    return pi;
  }

  async createPaymentIntentManual(params: {
    amountInCents: number;
    currency: string;
    customer: string;
    paymentMethodTypes: string[];
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }) {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: params.amountInCents,
        currency: params.currency,
        customer: params.customer,
        payment_method_types: params.paymentMethodTypes,
        metadata: params.metadata,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );
    this.logger.log(`✅ PaymentIntent creato (manual): ${pi.id}`);
    return pi;
  }

  async createEphemeralKey(customerId: string) {
    // ATTENZIONE: apiVersion deve rimanere allineata
    const key = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-11-20.acacia' }
    );
    return key;
  }

  async retrievePaymentIntent(piId: string) {
    return this.stripe.paymentIntents.retrieve(piId);
  }


  async createProduct(productData: {
    name: string;
    description: string;
    images?: string[];
    metadata?: Record<string, string>;
    tax_code?: string;
    package_dimensions?: {
      height: number;
      length: number;
      weight: number;
      width: number;
    };
    shippable?: boolean;
    unit_label?: string;
    url?: string;
  }): Promise<Stripe.Product> {
    try {
      const product = await this.stripe.products.create({
        name: productData.name,
        description: productData.description,
        images: productData.images,
        metadata: productData.metadata || {},
        tax_code: productData.tax_code || 'txcd_99999999',
        package_dimensions: productData.package_dimensions,
        shippable: productData.shippable,
        unit_label: productData.unit_label,
        url: productData.url,
      });

      this.logger.log(`✅ Prodotto Stripe creato: ${product.id} - ${productData.name}`);
      return product;
    } catch (error) {
      this.logger.error(`❌ Errore creazione prodotto Stripe: ${productData.name}`, error);
      throw error;
    }
  }

  async createPrice(priceData: {
    productId: string;
    amount: number;
    currency?: string;
    tax_behavior?: 'inclusive' | 'exclusive';
    billing_scheme?: 'per_unit' | 'tiered';
    metadata?: Record<string, string>;
    nickname?: string;
    recurring?: {
      interval: 'day' | 'week' | 'month' | 'year';
      interval_count?: number;
      usage_type?: 'licensed' | 'metered';
      aggregate_usage?: 'sum' | 'last_during_period' | 'last_ever' | 'max';
    };
    tiers?: Array<{
      up_to: number | 'inf';
      flat_amount?: number;
      unit_amount?: number;
    }>;
    transform_quantity?: {
      divide_by: number;
      round: 'up' | 'down';
    };
  }): Promise<Stripe.Price> {
    try {
      if (!priceData.productId) {
        throw new Error('Product ID è richiesto per creare un prezzo');
      }

      if (priceData.amount <= 0) {
        throw new Error('Amount deve essere maggiore di 0');
      }

      const price = await this.stripe.prices.create({
        product: priceData.productId,
        unit_amount: Math.round(priceData.amount * 100),
        currency: priceData.currency || 'eur',
        tax_behavior: priceData.tax_behavior || 'inclusive',
        billing_scheme: priceData.billing_scheme || 'per_unit',
        metadata: priceData.metadata || {},
        nickname: priceData.nickname,
        recurring: priceData.recurring,
        tiers: priceData.tiers,
        transform_quantity: priceData.transform_quantity,
      });

      this.logger.log(`✅ Prezzo Stripe creato: ${price.id} - €${priceData.amount}`);
      return price;
    } catch (error) {
      this.logger.error(`❌ Errore creazione prezzo Stripe per prodotto ${priceData.productId}`, error);
      throw error;
    }
  }

  async archiveProduct(productId: string): Promise<Stripe.Product> {
    try {
      const product = await this.stripe.products.update(productId, { active: false });
      this.logger.log(`📦 Prodotto Stripe archiviato: ${productId}`);
      return product;
    } catch (error) {
      this.logger.error(`❌ Errore archiviazione prodotto: ${productId}`, error);
      throw error;
    }
  }

  // ============= GESTIONE CLIENTI AVANZATA =============

  async createCustomer(customerData: {
    email: string;
    lastCheckoutEmail: string;
    name?: string;
    phone?: string;
    description?: string;
    metadata?: Record<string, string>;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postal_code: string;
      country: string;
    };
    shipping?: {
      name: string;
      address: {
        line1: string;
        line2?: string;
        city: string;
        state?: string;
        postal_code: string;
        country: string;
      };
      phone?: string;
    };
    tax_exempt?: 'none' | 'exempt' | 'reverse';
  }): Promise<Stripe.Customer> {
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerData.email || customerData.lastCheckoutEmail)) {
        throw new Error('Format email non valido');
      }

      const customer = await this.stripe.customers.create({
        email: customerData.email,
        name: customerData.name,
        phone: customerData.phone,
        description: customerData.description,
        metadata: customerData.metadata || {},
        address: customerData.address,
        shipping: customerData.shipping,
        tax_exempt: customerData.tax_exempt,
      });

      this.logger.log(`✅ Cliente Stripe creato: ${customer.id} - ${customerData.email}`);
      return customer;
    } catch (error) {
      this.logger.error(`❌ Errore creazione cliente Stripe: ${customerData.email}`, error);
      throw error;
    }
  }

  async updateCustomer(
    customerId: string,
    updateData: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, updateData);
      this.logger.log(`✅ Cliente Stripe aggiornato: ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`❌ Errore aggiornamento cliente: ${customerId}`, error);
      throw error;
    }
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    try {
      const deleted = await this.stripe.customers.del(customerId);
      this.logger.log(`🗑️ Cliente Stripe eliminato: ${customerId}`);
      return deleted;
    } catch (error) {
      this.logger.error(`❌ Errore eliminazione cliente: ${customerId}`, error);
      throw error;
    }
  }

  async getCustomerPaymentMethods(
    customerId: string,
    type?: 'card' | 'sepa_debit' | 'ideal' | 'bancontact'
  ): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: type || 'card',
      });

      return paymentMethods.data;
    } catch (error) {
      this.logger.error(`❌ Errore recupero metodi pagamento: ${customerId}`, error);
      throw error;
    }
  }

  // ============= SUBSCRIPTIONS & BILLING =============

  async createSubscription(subscriptionData: {
    customer: string;
    items: Array<{
      price: string;
      quantity?: number;
      metadata?: Record<string, string>;
    }>;
    trial_period_days?: number;
    trial_end?: number;
    default_payment_method?: string;
    collection_method?: 'charge_automatically' | 'send_invoice';
    billing_cycle_anchor?: number;
    proration_behavior?: 'create_prorations' | 'none' | 'always_invoice';
    metadata?: Record<string, string>;
    add_invoice_items?: Array<{
      price: string;
      quantity?: number;
    }>;
    coupon?: string;
    promotion_code?: string;
  }): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: subscriptionData.customer,
        items: subscriptionData.items,
        trial_period_days: subscriptionData.trial_period_days,
        trial_end: subscriptionData.trial_end,
        default_payment_method: subscriptionData.default_payment_method,
        collection_method: subscriptionData.collection_method || 'charge_automatically',
        billing_cycle_anchor: subscriptionData.billing_cycle_anchor,
        proration_behavior: subscriptionData.proration_behavior || 'create_prorations',
        metadata: subscriptionData.metadata || {},
        add_invoice_items: subscriptionData.add_invoice_items,
        discounts: subscriptionData.coupon ? [{ coupon: subscriptionData.coupon }] :
          subscriptionData.promotion_code ? [{ promotion_code: subscriptionData.promotion_code }] :
            undefined,
        expand: ['latest_invoice.payment_intent'],
      });

      this.logger.log(`🔄 Subscription creato: ${subscription.id} - Customer: ${subscriptionData.customer}`);
      return subscription;
    } catch (error) {
      this.logger.error(`❌ Errore creazione subscription:`, error);
      throw error;
    }
  }

  async updateSubscription(
    subscriptionId: string,
    updateData: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, updateData);
      this.logger.log(`🔄 Subscription aggiornato: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`❌ Errore aggiornamento subscription: ${subscriptionId}`, error);
      throw error;
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = false
  ): Promise<Stripe.Subscription> {
    try {
      let subscription: Stripe.Subscription;

      if (cancelAtPeriodEnd) {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      } else {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      }

      this.logger.log(`🚫 Subscription cancellato: ${subscriptionId} - Immediato: ${!cancelAtPeriodEnd}`);
      return subscription;
    } catch (error) {
      this.logger.error(`❌ Errore cancellazione subscription: ${subscriptionId}`, error);
      throw error;
    }
  }

  // ============= COUPONS & PROMOTION CODES =============

  async createCoupon(couponData: {
    id?: string;
    duration: 'forever' | 'once' | 'repeating';
    amount_off?: number;
    percent_off?: number;
    currency?: string;
    duration_in_months?: number;
    max_redemptions?: number;
    metadata?: Record<string, string>;
    name?: string;
    redeem_by?: number;
    applies_to?: {
      products?: string[];
    };
  }): Promise<Stripe.Coupon> {
    try {
      const coupon = await this.stripe.coupons.create({
        id: couponData.id,
        duration: couponData.duration,
        amount_off: couponData.amount_off ? Math.round(couponData.amount_off * 100) : undefined,
        percent_off: couponData.percent_off,
        currency: couponData.currency || 'eur',
        duration_in_months: couponData.duration_in_months,
        max_redemptions: couponData.max_redemptions,
        metadata: couponData.metadata || {},
        name: couponData.name,
        redeem_by: couponData.redeem_by,
        applies_to: couponData.applies_to,
      });

      this.logger.log(`🎫 Coupon creato: ${coupon.id} - ${coupon.percent_off || (coupon.amount_off! / 100)}`);
      return coupon;
    } catch (error) {
      this.logger.error(`❌ Errore creazione coupon:`, error);
      throw error;
    }
  }

  async updateProduct(stripeProductId: string, updateData: { name?: string; description?: string }): Promise<any> {
    try {
      return await this.stripe.products.update(stripeProductId, updateData);
    } catch (error) {
      throw new Error(`Failed to update Stripe product: ${error.message}`);
    }
  }

  async createPromotionCode(promotionData: {
    coupon: string;
    code?: string;
    customer?: string;
    expires_at?: number;
    max_redemptions?: number;
    restrictions?: {
      first_time_transaction?: boolean;
      minimum_amount?: number;
      minimum_amount_currency?: string;
    };
    metadata?: Record<string, string>;
  }): Promise<Stripe.PromotionCode> {
    try {
      const promotionCode = await this.stripe.promotionCodes.create({
        coupon: promotionData.coupon,
        code: promotionData.code,
        customer: promotionData.customer,
        expires_at: promotionData.expires_at,
        max_redemptions: promotionData.max_redemptions,
        restrictions: promotionData.restrictions,
        metadata: promotionData.metadata || {},
      });

      this.logger.log(`🎟️ Promotion Code creato: ${promotionCode.code} - Coupon: ${promotionData.coupon}`);
      return promotionCode;
    } catch (error) {
      this.logger.error(`❌ Errore creazione promotion code:`, error);
      throw error;
    }
  }

  // ============= REFUNDS AVANZATI =============

  async createRefund(refundData: {
    paymentIntentId?: string;
    chargeId?: string;
    amount?: number;
    refund_application_fee?: boolean;
    reverse_transfer?: boolean;
    instructions_email?: string;
    options?: {
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
      metadata?: Record<string, string>;
    }
  }): Promise<Stripe.Refund> {
    try {
      if (!refundData.paymentIntentId && !refundData.chargeId) {
        throw new Error('Payment Intent ID o Charge ID è richiesto per il rimborso');
      }

      const refundPayload: Stripe.RefundCreateParams = {
        reason: refundData.options?.reason || 'requested_by_customer',
        metadata: refundData.options?.metadata,
        refund_application_fee: refundData.refund_application_fee,
        reverse_transfer: refundData.reverse_transfer,
        instructions_email: refundData.instructions_email,
      };

      if (refundData.paymentIntentId) {
        refundPayload.payment_intent = refundData.paymentIntentId;
      } else if (refundData.chargeId) {
        refundPayload.charge = refundData.chargeId;
      }

      if (refundData.amount && refundData.amount > 0) {
        refundPayload.amount = Math.round(refundData.amount * 100);
      }

      const refund = await this.stripe.refunds.create(refundPayload);

      this.logger.log(`💰 Rimborso creato: ${refund.id} - €${(refund.amount || 0) / 100}`);
      return refund;
    } catch (error) {
      this.logger.error(`❌ Errore creazione rimborso`, error);
      throw error;
    }
  }

  async listRefunds(filters?: {
    charge?: string;
    payment_intent?: string;
    limit?: number;
    created?: {
      gte?: number;
      lte?: number;
    };
  }): Promise<Stripe.Refund[]> {
    try {
      const refunds = await this.stripe.refunds.list({
        charge: filters?.charge,
        payment_intent: filters?.payment_intent,
        limit: filters?.limit || 10,
        created: filters?.created,
      });

      return refunds.data;
    } catch (error) {
      this.logger.error(`❌ Errore lista rimborsi:`, error);
      throw error;
    }
  }

  // ============= DISPUTES MANAGEMENT =============

  async listDisputes(filters?: {
    payment_intent?: string;
    created?: {
      gte?: number;
      lte?: number;
    };
  }): Promise<Stripe.Dispute[]> {
    try {
      const listParams: Stripe.DisputeListParams = {
        limit: 100,
        created: filters?.created,
      };

      if (filters?.payment_intent) {
        listParams.payment_intent = filters.payment_intent;
      }

      const disputes = await this.stripe.disputes.list(listParams);

      return disputes.data;
    } catch (error) {
      this.logger.error(`❌ Errore lista disputes:`, error);
      throw error;
    }
  }

  async updateDispute(
    disputeId: string,
    updateData: {
      evidence?: Stripe.DisputeUpdateParams.Evidence;
      metadata?: Record<string, string>;
      submit?: boolean;
    }
  ): Promise<Stripe.Dispute> {
    try {
      const dispute = await this.stripe.disputes.update(disputeId, {
        evidence: updateData.evidence,
        metadata: updateData.metadata,
        submit: updateData.submit,
      });

      this.logger.log(`⚖️ Dispute aggiornato: ${disputeId}`);
      return dispute;
    } catch (error) {
      this.logger.error(`❌ Errore aggiornamento dispute: ${disputeId}`, error);
      throw error;
    }
  }

  // ============= ANALYTICS & REPORTING =============

  async getBalanceTransactions(filters?: {
    created?: {
      gte?: number;
      lte?: number;
    };
    currency?: string;
    type?: string;
    limit?: number;
  }): Promise<Stripe.BalanceTransaction[]> {
    try {
      const transactions = await this.stripe.balanceTransactions.list({
        created: filters?.created,
        currency: filters?.currency,
        type: filters?.type,
        limit: filters?.limit || 100,
      });

      return transactions.data;
    } catch (error) {
      this.logger.error(`❌ Errore recupero balance transactions:`, error);
      throw error;
    }
  }

  async getPayouts(filters?: {
    arrival_date?: {
      gte?: number;
      lte?: number;
    };
    created?: {
      gte?: number;
      lte?: number;
    };
    destination?: string;
    status?: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';
    limit?: number;
  }): Promise<Stripe.Payout[]> {
    try {
      const payouts = await this.stripe.payouts.list({
        arrival_date: filters?.arrival_date,
        created: filters?.created,
        destination: filters?.destination,
        status: filters?.status,
        limit: filters?.limit || 100,
      });

      return payouts.data;
    } catch (error) {
      this.logger.error(`❌ Errore recupero payouts:`, error);
      throw error;
    }
  }

  // ============= WEBHOOK VERIFICATION =============

  constructEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    try {
      if (!payload) {
        throw new Error('Payload webhook vuoto');
      }
      if (!signature) {
        throw new Error('Signature webhook mancante');
      }
      if (!webhookSecret) {
        throw new Error('Webhook secret non configurato');
      }

      const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      this.logger.debug(`✅ Signature webhook verificata: ${event.type} - ${event.id}`);
      return event;
    } catch (error) {
      this.logger.error('❌ Errore verifica signature webhook', {
        error: error.message,
        hasPayload: !!payload,
        payloadType: typeof payload,
        payloadLength: payload?.length || 0,
        hasSignature: !!signature,
        signaturePrefix: signature?.substring(0, 10),
      });
      throw error;
    }
  }

  async testWebhookEndpoint(
    endpointUrl: string,
    events: string[] = ['payment_intent.succeeded']
  ): Promise<{
    success: boolean;
    events_sent: string[];
    errors: string[];
  }> {
    try {
      const results = {
        success: true,
        events_sent: [] as string[],
        errors: [] as string[],
      };

      for (const eventType of events) {
        try {
          // Crea un evento di test
          const testEvent = await this.stripe.webhookEndpoints.create({
            url: endpointUrl,
            enabled_events: [eventType as any],
          });

          results.events_sent.push(eventType);

          // Cleanup
          await this.stripe.webhookEndpoints.del(testEvent.id);
        } catch (eventError) {
          results.success = false;
          results.errors.push(`${eventType}: ${eventError.message}`);
        }
      }

      return results;
    } catch (error) {
      this.logger.error('❌ Errore test webhook endpoint:', error);
      return {
        success: false,
        events_sent: [],
        errors: [error.message],
      };
    }
  }

  // ============= UTILITY METHODS =============

  centesToEuros(cents: number): number {
    return Math.round((cents / 100) * 100) / 100;
  }

  eurosToCents(euros: number): number {
    return Math.round(euros * 100);
  }

  isTestMode(): boolean {
    const config = this.configService.get('stripe');
    return config?.secretKey?.startsWith('sk_test') || false;
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }

  getApiVersion(): string {
    const config = this.configService.get('stripe');
    return config?.apiVersion || '2024-11-20.acacia';
  }

  // ============= CACHE MANAGEMENT =============

  clearCache(): void {
    this.cache.clear();
    this.logger.log('🧹 Cache Stripe pulita');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // ============= HEALTH CHECK =============

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    api_version: string;
    test_mode: boolean;
    balance_available: boolean;
    webhooks_configured: boolean;
    last_check: string;
  }> {
    try {
      // Test connessione base
      const balance = await this.stripe.balance.retrieve();

      // Test webhook configuration
      const webhookEndpoints = await this.stripe.webhookEndpoints.list({ limit: 1 });

      return {
        status: 'healthy',
        api_version: this.getApiVersion(),
        test_mode: this.isTestMode(),
        balance_available: !!balance.available,
        webhooks_configured: webhookEndpoints.data.length > 0,
        last_check: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('❌ Health check fallito:', error);
      return {
        status: 'unhealthy',
        api_version: this.getApiVersion(),
        test_mode: this.isTestMode(),
        balance_available: false,
        webhooks_configured: false,
        last_check: new Date().toISOString(),
      };
    }
  }

  // ============= LEGACY SUPPORT =============

  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    this.logger.warn('⚠️ confirmPaymentIntent è deprecato, usa createCheckoutSession');

    try {
      const updateData: Stripe.PaymentIntentConfirmParams = {};
      if (paymentMethodId) {
        updateData.payment_method = paymentMethodId;
      }

      const confirmedPayment = await this.stripe.paymentIntents.confirm(paymentIntentId, updateData);
      this.logger.log(`✅ Payment Intent confermato: ${paymentIntentId}`);
      return confirmedPayment;
    } catch (error) {
      this.logger.error(`❌ Errore conferma Payment Intent: ${paymentIntentId}`, error);
      throw error;
    }
  }

  async createPaymentIntent(paymentData: {
    amount: number;
    currency?: string;
    customerId?: string;
    metadata?: Record<string, string>;
    automatic_payment_methods?: { enabled: boolean };
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    this.logger.warn('⚠️ createPaymentIntent è deprecato, usa createCheckoutSession');

    try {
      if (paymentData.amount <= 0) {
        throw new Error('Amount deve essere maggiore di 0');
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(paymentData.amount * 100),
        currency: paymentData.currency || 'eur',
        customer: paymentData.customerId,
        description: paymentData.description,
        metadata: paymentData.metadata || {},
        automatic_payment_methods: paymentData.automatic_payment_methods || { enabled: true },
      });

      this.logger.log(`✅ Payment Intent creato: ${paymentIntent.id} - €${paymentData.amount}`);
      return paymentIntent;
    } catch (error) {
      this.logger.error(`❌ Errore creazione Payment Intent - Amount: €${paymentData.amount}`, error);
      throw error;
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const cancelledPayment = await this.stripe.paymentIntents.cancel(paymentIntentId);
      this.logger.log(`🚫 Payment Intent cancellato: ${paymentIntentId}`);
      return cancelledPayment;
    } catch (error) {
      this.logger.error(`❌ Errore cancellazione Payment Intent: ${paymentIntentId}`, error);
      throw error;
    }
  }

  async retrieveCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
      return customer;
    } catch (error) {
      this.logger.error(`❌ Errore recupero cliente: ${customerId}`, error);
      throw error;
    }
  }
}