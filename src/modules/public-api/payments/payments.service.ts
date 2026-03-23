import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';
import Stripe from 'stripe';

import { Coupon, CouponType } from 'src/database/entities/coupon.entity';

// Services
import { StripeService } from './stripe.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Payment, PaymentStatus } from 'src/database/entities/payment.entity';
import { User } from 'src/database/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private stripeService: StripeService,
    private notificationsService: NotificationsService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) { }

  // ===========================
  // 🔒 IDEMPOTENCY HELPERS
  // ===========================


  private buildStableIdempotencyKey(base: {
    purpose: string;
    cartKey?: string;
    userType: 'guest' | 'customer';
    userId?: string;
    amountInCents: number;
    currency: string;
    itemsCount: number;
    email?: string;
  }): string {
    const ordered = JSON.stringify({
      p: base.purpose,
      ck: base.cartKey || '',
      ut: base.userType,
      uid: base.userId || '',
      amt: base.amountInCents,
      cur: base.currency,
      ic: base.itemsCount,
      em: (base.email || '').toLowerCase(),
      v: 1,
    });
    const hash = createHash('sha256')
      .update(ordered)
      .digest('hex')
      .slice(0, 24);
    return `${base.purpose}_${hash}`;
  }

  private async safeCreatePaymentIntent(params: {
    createParams: Stripe.PaymentIntentCreateParams;
    idempotencyKey?: string;
  }): Promise<Stripe.PaymentIntent> {
    const stripe = this.stripeService.getStripeInstance();
    try {
      return await stripe.paymentIntents.create(
        params.createParams,
        params.idempotencyKey
          ? { idempotencyKey: params.idempotencyKey }
          : undefined
      );
    } catch (err: any) {
      if (err?.type === 'StripeIdempotencyError') {
        const newKey =
          (params.idempotencyKey || 'pi_retry_base') +
          '_retry_' +
          Date.now();
        this.logger.warn(
          `⚠️ Idempotency mismatch, retry con nuova chiave: ${newKey}`
        );
        return await stripe.paymentIntents.create(params.createParams, {
          idempotencyKey: newKey,
        });
      }
      throw err;
    }
  }

  // ===========================
  // 💳 PAYMENT INTENT FOR ORDER (Stripe Elements)
  // ===========================

  /**
   * Crea PaymentIntent per ordine esistente (già creato con reservation)
   * Usato da CheckoutService.initElements
   */
  async createPaymentIntentForOrder(
    orderId: string,
    manager?: EntityManager
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    ephemeralKey?: string;
    customerId: string;
    amount: number;
    currency: string;
    idempotencyKeyUsed: string;
  }> {
    const execute = async (mgr: EntityManager) => {
      const order = await mgr.findOne(Order, {
        where: { id: orderId },
        relations: ['user', 'items', 'items.variant', 'items.variant.product'],
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non è in stato PENDING (attuale: ${order.status})`
        );
      }

      let stripeCustomerId: string;

      if (order.user) {
        stripeCustomerId = await this.usersService.ensureStripeCustomer(
          order.user.id,
          mgr,
        );
      } else {

        if (!order.customerEmail) {
          throw new BadRequestException('customerEmail richiesto per ordine guest');
        }

        const customer = await this.stripeService.createCustomer({
          email: order.customerEmail,
          lastCheckoutEmail: order.customerEmail,
          name: order.shippingAddress?.name,
          metadata: {
            guest: 'true',
            orderId: order.id,
            orderNumber: order.orderNumber,
          },
        });

        stripeCustomerId = customer.id;
        this.logger.log(`✅ Stripe Customer creato per guest: ${stripeCustomerId}`);
      }

      const amount = order.total;
      const amountInCents = Math.round(amount * 100);

      if (amountInCents <= 0) {
        throw new BadRequestException('Importo ordine non valido');
      }

      const stableKey = this.buildStableIdempotencyKey({
        purpose: 'pi_order',
        cartKey: order.id,
        userType: order.user ? 'customer' : 'guest',
        userId: order.user?.id,
        amountInCents,
        currency: 'eur',
        itemsCount: order.items.length,
        email: order.customerEmail || order.user?.email || '',
      });

      // 4. Crea PaymentIntent
      const createParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInCents,
        currency: 'eur',
        customer: stripeCustomerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'always',
        },
        shipping: {
          name: order.shippingAddress?.name || 'Cliente',
          address: {
            line1: order.shippingAddress?.street || '',
            city: order.shippingAddress?.city || '',
            postal_code: order.shippingAddress?.postalCode || '',
            country: order.shippingAddress?.country || 'IT',
          },
          phone: order.shippingAddress?.phone,
        },
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.user?.id || '',
          customerEmail: order.customerEmail || '',
          ...(order.couponCode ? {
            couponCode: order.couponCode,
            discountAmount: String(order.discountAmount ?? 0),
          } : {}),
        },
        capture_method: 'automatic',
        setup_future_usage: 'off_session',
      } as any;

      const pi = await this.safeCreatePaymentIntent({
        createParams,
        idempotencyKey: stableKey,
      });

      // 5. Crea EphemeralKey per mobile
      const ephemeralKey = await this.stripeService.createEphemeralKey(
        stripeCustomerId
      );

      // 6. Aggiorna ordine con PI ID
      await mgr.update(Order, order.id, {
        stripePaymentIntentId: pi.id,
      });

      // 7. Emit evento
      this.eventEmitter.emit('payment_intent.created', {
        order,
        user: order.user || null,
        paymentIntent: pi,
      });

      this.logger.log(
        `✅ PaymentIntent creato: ${pi.id} • Ordine: ${order.orderNumber} • Amount: €${amount} • Key: ${stableKey}`
      );

      return {
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret!,
        ephemeralKey: ephemeralKey?.secret,
        customerId: stripeCustomerId,
        amount,
        currency: 'eur',
        idempotencyKeyUsed: stableKey,
      };
    };

    return manager
      ? execute(manager)
      : this.dataSource.transaction(execute);
  }

  // ===========================
  // 💰 ADVANCED REFUND (AGGIORNATO)
  // ===========================

  /**
   * Crea rimborso avanzato con notifiche allineate
   */
  async createAdvancedRefund(refundData: {
    orderId?: string;
    paymentIntentId?: string;
    chargeId?: string;
    amount?: number;
    reason:
    | 'duplicate'
    | 'fraudulent'
    | 'requested_by_customer'
    | 'return'
    | 'defective_product';
    refundItems?: Array<{
      orderItemId: string;
      quantity: number;
      reason: string;
    }>;
    restoreStock?: boolean;
    notifyCustomer?: boolean;
    internalNotes?: string;
  }): Promise<{
    refund: any;
    refundAmount: number;
    stockRestored: boolean;
    notificationSent: boolean;
    orderStatus: OrderStatus;
  }> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Trova payment
      let payment: Payment | null = null;

      if (refundData.orderId) {
        payment = await manager.findOne(Payment, {
          where: { orderId: refundData.orderId },
          relations: ['order', 'order.items', 'order.user'],
        });
      } else if (refundData.paymentIntentId) {
        payment = await manager.findOne(Payment, {
          where: { stripePaymentIntentId: refundData.paymentIntentId },
          relations: ['order', 'order.items', 'order.user'],
        });
      } else if (refundData.chargeId) {
        payment = await manager.findOne(Payment, {
          where: { stripeChargeId: refundData.chargeId },
          relations: ['order', 'order.items', 'order.user'],
        });
      }

      if (!payment) {
        throw new NotFoundException('Pagamento non trovato');
      }

      if (payment.status !== PaymentStatus.SUCCEEDED) {
        throw new BadRequestException(
          'Pagamento non in stato valido per rimborso'
        );
      }

      // 2. Calcola refund amount
      let refundAmount = refundData.amount;

      if (!refundAmount && refundData.refundItems) {
        refundAmount = this.calculatePartialRefundAmount(
          payment.order.items,
          refundData.refundItems
        );
      } else if (!refundAmount) {
        refundAmount = payment.amount - payment.refundedAmount;
      }

      if (!refundAmount || refundAmount <= 0) {
        throw new BadRequestException('Importo rimborso deve essere > 0');
      }

      if (payment.refundedAmount + refundAmount > payment.amount) {
        throw new BadRequestException(
          'Importo rimborso supera totale pagato'
        );
      }

      // 3. Crea refund su Stripe
      const mappedReason = this.mapRefundReasonToStripe(refundData.reason);
      const refundPayload: Parameters<StripeService['createRefund']>[0] & {
        reason?: Stripe.RefundCreateParams.Reason;
        metadata?: Record<string, string>;
      } = {
        paymentIntentId: payment.stripePaymentIntentId,
        chargeId: payment.stripeChargeId,
        amount: refundAmount,
        reason: mappedReason,
        metadata: {
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          refundReason: refundData.reason,
          internalNotes: refundData.internalNotes || '',
          refundItems: refundData.refundItems
            ? JSON.stringify(refundData.refundItems)
            : '',
          processedBy: 'system',
          processedAt: new Date().toISOString(),
        },
      };
      const stripeRefund = await this.stripeService.createRefund(refundPayload);

      // 4. Aggiorna payment
      const newRefundedAmount = payment.refundedAmount + refundAmount;
      const isFullRefund = newRefundedAmount >= payment.amount;

      await manager.update(Payment, payment.id, {
        refundedAmount: newRefundedAmount,
        status: isFullRefund
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      });

      // 5. Aggiorna ordine
      const newOrderStatus = isFullRefund
        ? OrderStatus.REFUNDED
        : payment.order.status;

      await manager.update(Order, payment.order.id, {
        status: newOrderStatus,
      });

      // 6. Ripristina stock (se richiesto)
      let stockRestored = false;
      if (refundData.restoreStock !== false) {
        try {
          if (refundData.refundItems) {
            await this.restoreStockForPartialRefund(
              refundData.refundItems,
              manager
            );
          } else {
            await this.restoreStockForFullRefund(
              payment.order.items,
              refundAmount,
              payment.amount,
              manager
            );
          }
          stockRestored = true;
          this.logger.log(
            `📦 Stock ripristinato per ordine ${payment.order.orderNumber}`
          );
        } catch (stockErr) {
          this.logger.error('❌ Errore ripristino stock:', stockErr);
        }
      }

      // 7. ✅ INVIA EMAIL RIMBORSO (AGGIORNATO)
      let notificationSent = false;
      if (refundData.notifyCustomer !== false) {
        try {
          const email =
            payment.order.user?.email || payment.order.customerEmail;

          if (email) {
            await this.notificationsService.sendRefundProcessedEmail(
              payment.order,
              payment.order.user,
              {
                refundAmount,
                isFullRefund,
                reason: refundData.reason,
                estimatedArrival: this.calculateRefundArrivalDate(),
              }
            );
            notificationSent = true;
            this.logger.log(
              `📧 Email rimborso inviata a ${email}`
            );
          }
        } catch (notifErr) {
          this.logger.error('❌ Errore invio notifica rimborso:', notifErr);
        }
      }

      // 8. Emit evento
      this.eventEmitter.emit('refund.processed', {
        payment,
        order: payment.order,
        user: payment.order.user,
        refund: stripeRefund,
        refundAmount,
        isFullRefund,
        stockRestored,
        reason: refundData.reason,
      });

      this.logger.log(
        `💰 Rimborso processato: ${stripeRefund.id} - €${refundAmount} ` +
        `per ordine ${payment.order.orderNumber} ` +
        `(Full: ${isFullRefund}, Stock: ${stockRestored}, Email: ${notificationSent})`
      );

      return {
        refund: stripeRefund,
        refundAmount,
        stockRestored,
        notificationSent,
        orderStatus: newOrderStatus,
      };
    });
  }

  // ===========================
  // 📊 PAYMENT METHODS (Save/List/Remove)
  // ===========================

  async savePaymentMethod(
    userId: string,
    paymentMethodId: string,
    setAsDefault = false
  ): Promise<{
    paymentMethod: any;
    isDefault: boolean;
    totalSavedMethods: number;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato');
    if (!user.stripeCustomerId)
      throw new BadRequestException('Customer Stripe non configurato');

    const stripe = this.stripeService.getStripeInstance();
    try {
      const pm = await stripe.paymentMethods
        .attach(paymentMethodId, { customer: user.stripeCustomerId })
        .catch(async (err) => {
          if (err?.type === 'StripeInvalidRequestError') {
            return stripe.paymentMethods.retrieve(paymentMethodId);
          }
          throw err;
        });

      if (setAsDefault) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        // ✅ Sincronizza defaultPaymentMethodId nel database User
        await this.userRepository.update(user.id, {
          defaultPaymentMethodId: paymentMethodId,
        });
        this.logger.log(`💳 defaultPaymentMethodId sincronizzato: ${paymentMethodId}`);
      }

      const saved = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });

      // ✅ Se è il primo metodo di pagamento, impostalo come default automaticamente
      if (saved.data.length === 1 && !setAsDefault) {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
        await this.userRepository.update(user.id, {
          defaultPaymentMethodId: paymentMethodId,
        });
        this.logger.log(`💳 Primo metodo pagamento, impostato come default: ${paymentMethodId}`);
      }

      this.eventEmitter.emit('payment_method.saved', {
        user,
        paymentMethodId,
        isDefault: setAsDefault || saved.data.length === 1,
      });

      this.logger.log(
        `💳 Payment method salvato: ${paymentMethodId} per user ${userId} ` +
        `(default: ${setAsDefault})`
      );

      return {
        paymentMethod: pm,
        isDefault: !!setAsDefault,
        totalSavedMethods: saved.data.length,
      };
    } catch (e) {
      this.logger.error('❌ Errore salvataggio metodo pagamento:', e);
      throw new BadRequestException(
        'Impossibile salvare metodo di pagamento'
      );
    }
  }

  async getUserPaymentMethods(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato');
    if (!user.stripeCustomerId) return [];

    const stripe = this.stripeService.getStripeInstance();
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    return paymentMethods.data.map((pm) => {
      const card = pm.card;
      if (!card) {
        return {
          brand: 'unknown',
          last4: '',
          expMonth: 0,
          expYear: 0,
          isDefault: pm.id === user.defaultPaymentMethodId,
        };
      }
      return {
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        isDefault: pm.id === user.defaultPaymentMethodId,
      };
    });
  }

  async removePaymentMethod(
    userId: string,
    paymentMethodId: string
  ): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato');

    try {
      const stripe = this.stripeService.getStripeInstance();
      await stripe.paymentMethods.detach(paymentMethodId);

      // ✅ Se stai rimuovendo il metodo di pagamento default, pulisci il campo
      if (user.defaultPaymentMethodId === paymentMethodId) {
        await this.userRepository.update(user.id, {
          defaultPaymentMethodId: undefined as any,
        });
        this.logger.log(`💳 defaultPaymentMethodId rimosso per user ${userId}`);
      }

      this.eventEmitter.emit('payment_method.removed', {
        user,
        paymentMethodId,
      });

      this.logger.log(
        `🗑️ Payment method rimosso: ${paymentMethodId} per user ${userId}`
      );

      return true;
    } catch (e) {
      this.logger.error('❌ Errore rimozione metodo pagamento:', e);
      throw new BadRequestException(
        'Impossibile rimuovere metodo di pagamento'
      );
    }
  }

  // ===========================
  // 🔧 SETUP INTENT (per salvare carte senza pagare)
  // ===========================

  async createSetupIntent(
    userId: string,
    options?: {
      paymentMethodTypes?: string[];
      usage?: 'on_session' | 'off_session';
      metadata?: Record<string, string>;
    }
  ): Promise<{
    setupIntentId: string;
    clientSecret: string;
    ephemeralKey?: string;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utente non trovato');

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const c = await this.stripeService.createCustomer({
        email: user.email ?? user.lastCheckoutEmail ?? '',
        lastCheckoutEmail: user.lastCheckoutEmail ?? user.email ?? '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'undefined',
        metadata: { dbUserId: user.id },
      });
      stripeCustomerId = c.id;
      await this.userRepository.update(user.id, { stripeCustomerId });
    }

    const stripe = this.stripeService.getStripeInstance();
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId as string,
        payment_method_types: (options?.paymentMethodTypes || ['card']) as any,
        usage: (options?.usage || 'off_session') as any,
        metadata: {
          userId: user.id,
          userEmail: user.email ?? '',
          ...(options?.metadata || {}),
        },
      });

      let ephemeralKey;
      if (options?.metadata?.platform === 'mobile') {
        ephemeralKey = await stripe.ephemeralKeys.create(
          { customer: stripeCustomerId },
          { apiVersion: '2024-11-20.acacia' }
        );
      }

      this.logger.log(`🔧 Setup Intent creato: ${setupIntent.id}`);

      return {
        setupIntentId: setupIntent.id,
        clientSecret: setupIntent.client_secret!,
        ephemeralKey: ephemeralKey?.secret,
      };
    } catch (e) {
      this.logger.error('❌ Errore creazione Setup Intent:', e);
      throw new BadRequestException(
        'Impossibile configurare metodo di pagamento'
      );
    }
  }

  // ===========================
  // 🛒 CHECKOUT SESSION (Stripe Hosted)
  // ===========================

  // async createCheckoutSession(orderId: string): Promise<Stripe.Checkout.Session> {
  //   const order = await this.orderRepository.findOne({
  //     where: { id: orderId },
  //     relations: ['items', 'items.product', 'user'],
  //   });

  //   if (!order) throw new NotFoundException('Ordine non trovato');

  //   // Calcolo costo spedizione (differenza tra totale ordine e somma prodotti)
  //   // Questo assume che order.total sia il finale inclusivo di spedizione
  //   const productsTotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  //   const shippingCost = Math.max(0, order.total - productsTotal);

  //   // ✅ Assicuriamo che l'utente abbia un Customer ID su Stripe (come facciamo per gli Elements)
  //   let stripeCustomerId = order.user?.stripeCustomerId;
  //   if (order.user && !stripeCustomerId) {
  //     // Se l'utente è loggato ma non ha ID Stripe, lo creiamo ora
  //     stripeCustomerId = await this.usersService.ensureStripeCustomer(order.user.id);
  //   }

  //   return this.stripeService.createCheckoutSession({
  //     customer: stripeCustomerId,
  //     customer_email: !order.user ? (order.customerEmail || undefined) : undefined,
  //     payment_method_types: ['card', 'paypal'],
  //     line_items: order.items.map(item => ({
  //       price_data: {
  //         currency: 'eur',
  //         product_data: {
  //           name: item.product.name,
  //           images: item.product.images,
  //           metadata: {
  //             productId: item.product.id
  //           }
  //         },
  //         unit_amount: Math.round(item.unitPrice * 100),
  //       },
  //       quantity: item.quantity,
  //     })),
  //     mode: 'payment',
  //     success_url: `${process.env.FRONTEND_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
  //     cancel_url: `${process.env.FRONTEND_URL}/checkout?canceled=true`,
  //     metadata: {
  //       orderId: order.id,
  //       orderNumber: order.orderNumber,
  //     },
  //     // ✅ Passiamo qui le opzioni di spedizione (BRT)
  //     shipping_options: [
  //       {
  //         shipping_rate_data: {
  //           type: 'fixed_amount',
  //           fixed_amount: {
  //             amount: Math.round(shippingCost * 100),
  //             currency: 'eur',
  //           },
  //           display_name: 'Spedizione BRT Express',
  //           delivery_estimate: {
  //             minimum: { unit: 'business_day', value: 1 },
  //             maximum: { unit: 'business_day', value: 2 },
  //           },
  //         },
  //       },
  //     ],
  //   });
  // }

  // ===========================
  // 🛒 CHECKOUT SESSION (Stripe Hosted)
  // ===========================

  async createCheckoutSession(orderId: string): Promise<Stripe.Checkout.Session> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.variant', 'items.variant.product', 'user'],
    });

    if (!order) throw new NotFoundException('Ordine non trovato');

    const productsTotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const shippingCost = Math.max(0, order.total - productsTotal);

    let stripeCustomerId = order.user?.stripeCustomerId;
    if (order.user && !stripeCustomerId) {
      stripeCustomerId = await this.usersService.ensureStripeCustomer(order.user.id);
    }

    return this.stripeService.createCheckoutSession({
      customer: stripeCustomerId,
      customer_email: !order.user ? (order.customerEmail || undefined) : undefined,
      payment_method_types: ['card', 'paypal'],
      line_items: order.items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.productName,
            images: item.variant?.images ?? [],
            metadata: {
              variantId: item.variantId ?? '',
              clothingType: item.variant?.product?.category?.clothingType ?? '',
              Item: item.productName,
              Color: item.variant?.colorName ?? '',
              Size: item.size ?? '',
              SKU: item.productSku,
            }
          },
          unit_amount: Math.round(item.unitPrice * 100),
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout?canceled=true`,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
      // ✅ Passiamo qui le opzioni di spedizione (BRT)
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: Math.round(shippingCost * 100),
              currency: 'eur',
            },
            display_name: 'Spedizione BRT Express',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 2 },
            },
          },
        },
      ],
    });
  }

  // ===========================
  // � PAYMENT INSIGHTS
  // ===========================

  async getPaymentInsights(filters?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    status?: PaymentStatus[];
  }): Promise<{
    totalRevenue: number;
    totalTransactions: number;
    averageTransactionValue: number;
    successRate: number;
    topPaymentMethods: Array<{
      method: string;
      count: number;
      revenue: number;
    }>;
    refundRate: number;
    revenueByDay: Array<{
      date: string;
      revenue: number;
      transactions: number;
    }>;
    failureReasons: Array<{ reason: string; count: number }>;
  }> {
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.order', 'order');

    if (filters?.startDate)
      qb.andWhere('payment.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    if (filters?.endDate)
      qb.andWhere('payment.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
    if (filters?.userId)
      qb.andWhere('order.userId = :userId', { userId: filters.userId });
    if (filters?.status?.length)
      qb.andWhere('payment.status IN (:...statuses)', {
        statuses: filters.status,
      });

    const payments = await qb.getMany();

    const successful = payments.filter(
      (p) => p.status === PaymentStatus.SUCCEEDED
    );
    const totalRevenue = successful.reduce((s, p) => s + p.amount, 0);
    const totalTransactions = payments.length;
    const averageTransactionValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const successRate =
      totalTransactions > 0
        ? (successful.length / totalTransactions) * 100
        : 0;

    const methodCounts = new Map<string, { count: number; revenue: number }>();
    successful.forEach((p) => {
      const m = p.method || 'unknown';
      const c = methodCounts.get(m) || { count: 0, revenue: 0 };
      methodCounts.set(m, {
        count: c.count + 1,
        revenue: c.revenue + p.amount,
      });
    });

    const topPaymentMethods = Array.from(methodCounts.entries())
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    const refunded = payments.filter(
      (p) =>
        p.status === PaymentStatus.REFUNDED ||
        p.status === PaymentStatus.PARTIALLY_REFUNDED
    );
    const refundRate =
      successful.length > 0 ? (refunded.length / successful.length) * 100 : 0;

    const revenueByDay = this.groupPaymentsByDay(successful);
    const failedPayments = payments.filter(
      (p) => p.status === PaymentStatus.FAILED
    );
    const failureReasons = this.analyzeFailureReasons(failedPayments);

    return {
      totalRevenue: this.roundToTwo(totalRevenue),
      totalTransactions,
      averageTransactionValue: this.roundToTwo(averageTransactionValue),
      successRate: this.roundToTwo(successRate),
      topPaymentMethods,
      refundRate: this.roundToTwo(refundRate),
      revenueByDay,
      failureReasons,
    };
  }

  // ===========================
  // 🔍 RETRIEVAL METHODS
  // ===========================

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { orderId },
      relations: ['order'],
    });
  }

  async findBySessionId(sessionId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { stripeSessionId: sessionId },
      relations: ['order'],
    });
  }

  async findByPaymentIntentId(
    paymentIntentId: string
  ): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['order'],
    });
  }

  async getPaymentStatus(sessionId: string): Promise<any> {
    const [stripeSession, payment] = await Promise.all([
      this.stripeService.retrieveCheckoutSession(sessionId),
      this.paymentRepository.findOne({
        where: { stripeSessionId: sessionId },
        relations: ['order'],
      }),
    ]);

    return {
      stripe: stripeSession,
      database: payment,
    };
  }

  // ===========================
  // 🛠️ PRIVATE UTILITY METHODS
  // ===========================

  private async getUserOrderCount(userId: string): Promise<number> {
    return this.orderRepository.count({
      where: {
        userId,
        status: In([
          OrderStatus.CONFIRMED,
          OrderStatus.DELIVERED,
          OrderStatus.SHIPPED,
        ]),
      },
    });
  }

  private async calculateCouponDiscount(
    coupon: Coupon,
    subtotal: number
  ): Promise<number> {
    if (coupon.type === CouponType.PERCENTAGE) {
      const discount = (subtotal * coupon.value) / 100;
      return coupon.maximumDiscountAmount
        ? Math.min(discount, coupon.maximumDiscountAmount)
        : discount;
    } else if (coupon.type === CouponType.FIXED_AMOUNT) {
      return Math.min(coupon.value, subtotal);
    }
    return 0;
  }

  private getTaxCodeForProduct(orderItem: any): string {
    try {
      const clothingType = orderItem.variant?.product?.category?.clothingType ?? '';
      const taxCodes: Record<string, string> = {
        shoes: 'txcd_99999999',
        belts: 'txcd_99999999',
        accessories: 'txcd_99999999',
      };
      return taxCodes[clothingType] ?? 'txcd_33040000'; // Default: generic clothing
    } catch {
      return 'txcd_33040000';
    }
  }

  private async estimateOrderTaxes(
    order: Order,
    amount: number
  ): Promise<number> {
    const defaultTaxRate = 0.22;
    return Math.round(amount * defaultTaxRate * 100) / 100;
  }

  private calculatePartialRefundAmount(
    orderItems: any[],
    refundItems: any[]
  ): number {
    let refundAmount = 0;
    refundItems.forEach((r) => {
      const oi = orderItems.find((i) => i.id === r.orderItemId);
      if (oi) refundAmount += oi.unitPrice * r.quantity;
    });
    return refundAmount;
  }

  private async restoreStockForPartialRefund(
    refundItems: any[],
    manager: any
  ): Promise<void> {
    for (const item of refundItems) {
      this.logger.log(
        `🔄 Ripristino parziale stock item ${item.orderItemId} +${item.quantity}`
      );
      // TODO: Implementa logica ripristino stock
    }
  }

  private async restoreStockForFullRefund(
    orderItems: any[],
    refundAmount: number,
    totalAmount: number,
    manager: any
  ): Promise<void> {
    const ratio = refundAmount / totalAmount;
    for (const item of orderItems) {
      const qty = Math.floor(item.quantity * ratio);
      if (qty > 0) {
        this.logger.log(
          `🔄 Ripristino completo stock variante ${item.variantId} +${qty}`
        );
        // TODO: Implementa logica ripristino stock
      }
    }
  }

  private calculateRefundArrivalDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date.toLocaleDateString('it-IT');
  }

  private groupPaymentsByDay(
    payments: Payment[]
  ): Array<{ date: string; revenue: number; transactions: number }> {
    const grouped = new Map<
      string,
      { revenue: number; transactions: number }
    >();
    payments.forEach((p) => {
      const d = p.createdAt.toISOString().split('T')[0];
      const c = grouped.get(d) || { revenue: 0, transactions: 0 };
      grouped.set(d, {
        revenue: c.revenue + p.amount,
        transactions: c.transactions + 1,
      });
    });
    return Array.from(grouped.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private analyzeFailureReasons(
    failedPayments: Payment[]
  ): Array<{ reason: string; count: number }> {
    const m = new Map<string, number>();
    failedPayments.forEach((p) => {
      const r = p.failureReason || 'Unknown';
      m.set(r, (m.get(r) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  private roundToTwo(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private mapRefundReasonToStripe(
    reason:
      | 'duplicate'
      | 'fraudulent'
      | 'requested_by_customer'
      | 'return'
      | 'defective_product'
  ): 'duplicate' | 'fraudulent' | 'requested_by_customer' {
    if (reason === 'duplicate' || reason === 'fraudulent') return reason;
    return 'requested_by_customer';
  }

}