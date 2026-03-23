// src/modules/orders/checkout.service.ts

import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { isUUID } from 'class-validator';

// Entities
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { User, UserRole } from 'src/database/entities/user.entity';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { OrderItem } from 'src/database/entities/order-item.entity';

// Services
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { AddressService } from '../addresses/addresses.service';

// Security
import { DuplicateOrderGuard } from 'src/common/security/duplicate-order.guard';

// DTOs
import { CheckoutDto } from './dto/order.dto';
import { CartService } from '../cart/cart.service';

type CartType = 'guest' | 'customer';

interface CartContext {
  key: string;
  type: CartType;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private ordersService: OrdersService,
    private paymentsService: PaymentsService,
    private cartService: CartService,
    private addressService: AddressService,
    private dataSource: DataSource,
    private duplicateOrderGuard: DuplicateOrderGuard,
  ) { }

  // ===========================
  // 🛒 MAIN CHECKOUT FLOW (Stripe Elements)
  // ===========================

  /**
   * Inizializza Stripe Elements per checkout
   *
   * FLUSSO NUOVO CON RESERVATIONS:
   * 1. Valida carrello e checkout data
   * 2. Gestisce idempotenza (riutilizzo ordini PENDING recenti)
   * 3. Crea ordine PENDING
   * 4. Soft reserve stock (2h expiry)
   * 5. Crea PaymentIntent
   * 6. Ritorna clientSecret per Stripe Elements
   *
   * NON svuota il carrello (lo farà il webhook dopo pagamento)
   */


  async initElements(user: any, checkoutData: CheckoutDto): Promise<{
    success: boolean;
    orderId: string;
    orderNumber: string;
    paymentIntentId: string;
    clientSecret: string;
    customerId?: string;
    ephemeralKey?: string;
    amount: number;
    currency: string;
    stockReservedUntil: Date;
    message: string;
  }> {
    const ctx = this.resolveCartContext(user?.user || user);

    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`🛒 Init Elements checkout: ${ctx.type} - ${ctx.key}`);

      const startTime = Date.now();
      const logProgress = (step: string) => {
        const elapsed = Date.now() - startTime;
        this.logger.log(`⏱️ [${elapsed}ms] ${step}`);
      };

      // Variabile per tracciare il lock (per cleanup in caso di errore)
      let checkoutLockKey: string | null = null;

      try {
        // 1. Carica carrello
        logProgress('START: Load cart');
        const cart = await this.cartService.getCart(ctx.key, ctx.type, manager);
        logProgress('DONE: Load cart');

        if (!cart || !cart.items || cart.items.length === 0) {
          throw new BadRequestException('Carrello vuoto');
        }

        // 2. Calcola hash carrello per idempotenza
        logProgress('START: Calculate cart hash');
        const cartHash = this.calculateCartHash(cart.items, checkoutData.couponCode);
        logProgress('DONE: Calculate cart hash');

        // 2.1 SECURITY: Check duplicate order prevention
        logProgress('START: Check duplicate order');
        const cartTotal = cart.items.reduce(
          (sum, item) => sum + (item.variant?.variantPriceOverride ?? (item.variant?.product as any)?.basePrice ?? 0) * item.quantity,
          0,
        );
        checkoutLockKey = this.duplicateOrderGuard.generateCheckoutKey(
          ctx.key,
          cartHash,
          cartTotal,
        );

        const lockCheck = await this.duplicateOrderGuard.isCheckoutInProgress(checkoutLockKey);
        if (lockCheck.inProgress && lockCheck.existingOrderId) {
          if (!isUUID(lockCheck.existingOrderId)) {
            throw new ConflictException('Checkout già in corso. Riprova tra poco.');
          }
          // Un checkout è già in corso - recupera l'ordine esistente
          const existingLockedOrder = await manager.findOne(Order, {
            where: { id: lockCheck.existingOrderId },
          });

          if (existingLockedOrder && existingLockedOrder.status === OrderStatus.PENDING) {
            this.logger.warn(
              `⚠️ SECURITY: Duplicate checkout blocked for ${ctx.key}. ` +
              `Existing order: ${existingLockedOrder.orderNumber}`,
            );

            // Invece di bloccare, ritorna l'ordine esistente
            if (existingLockedOrder.stripePaymentIntentId) {
              const stripe = this.paymentsService['stripeService'].getStripeInstance();
              const existingPI = await stripe.paymentIntents.retrieve(
                existingLockedOrder.stripePaymentIntentId,
              );

              if (existingPI.client_secret) {
                return {
                  success: true,
                  orderId: existingLockedOrder.id,
                  orderNumber: existingLockedOrder.orderNumber,
                  paymentIntentId: existingPI.id,
                  clientSecret: existingPI.client_secret,
                  amount: existingLockedOrder.total,
                  currency: 'eur',
                  stockReservedUntil: existingLockedOrder.stockReservationExpiresAt ?? new Date(),
                  message: 'Checkout già in corso. Riutilizzo ordine esistente.',
                };
              }
            }
          }
        }
        logProgress('DONE: Check duplicate order');

        // 3. Cerca ordine PENDING recente identico (ultimi 2 ore)
        logProgress('START: Find existing order');
        const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

        const existingOrder = await manager
          .createQueryBuilder(Order, 'o')
          .leftJoinAndSelect('o.items', 'items')
          .where('o.status = :status', { status: OrderStatus.PENDING })
          .andWhere('o.createdAt > :twoHoursAgo', { twoHoursAgo: TWO_HOURS_AGO })
          .andWhere('o.userId = :identifier', { identifier: ctx.key })
          .orderBy('o.createdAt', 'DESC')
          .getOne();

        logProgress('DONE: Find existing order');

        // 4. Verifica idempotenza con carrello identico
        if (existingOrder) {
          const existingCartHash = this.calculateOrderItemsHash(existingOrder.items, existingOrder.couponCode ?? undefined);

          if (existingCartHash === cartHash) {
            // ✅ Carrello IDENTICO
            if (
              existingOrder.stockReservationExpiresAt &&
              existingOrder.stockReservationExpiresAt > new Date()
            ) {
              this.logger.log(
                `♻️ Riutilizzo ordine esistente: ${existingOrder.orderNumber} ` +
                `(reservation valida fino a ${existingOrder.stockReservationExpiresAt.toLocaleString('it-IT')})`,
              );

              // Verifica se ha già PaymentIntent valido
              if (existingOrder.stripePaymentIntentId) {
                try {
                  const stripe = this.paymentsService['stripeService'].getStripeInstance();
                  const existingPI = await stripe.paymentIntents.retrieve(
                    existingOrder.stripePaymentIntentId,
                  );

                  // Se PI è ancora utilizzabile, riutilizzalo
                  if (
                    existingPI.status === 'requires_payment_method' ||
                    existingPI.status === 'requires_confirmation' ||
                    existingPI.status === 'requires_action'
                  ) {
                    this.logger.log(`♻️ Riutilizzo PaymentIntent: ${existingPI.id}`);

                    return {
                      success: true,
                      orderId: existingOrder.id,
                      orderNumber: existingOrder.orderNumber,
                      paymentIntentId: existingPI.id,
                      clientSecret: existingPI.client_secret!,
                      customerId: existingPI.customer as string,
                      amount: existingOrder.total,
                      currency: 'eur',
                      stockReservedUntil: existingOrder.stockReservationExpiresAt!,
                      message: 'Ordine esistente riutilizzato.',
                    };
                  } else {
                    this.logger.log(
                      `⚠️ PI ${existingPI.id} in stato ${existingPI.status}, creo nuovo PI`,
                    );
                  }
                } catch (piError) {
                  this.logger.warn(
                    `⚠️ PI ${existingOrder.stripePaymentIntentId} non valido: ${piError.message}`,
                  );
                }
              }

              // PaymentIntent non valido, creane uno nuovo per l'ordine esistente
              const paymentResult = await this.paymentsService.createPaymentIntentForOrder(
                existingOrder.id,
                manager,
              );

              return {
                success: true,
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                paymentIntentId: paymentResult.paymentIntentId,
                clientSecret: paymentResult.clientSecret,
                customerId: paymentResult.customerId,
                amount: paymentResult.amount,
                currency: paymentResult.currency || 'eur',
                stockReservedUntil: existingOrder.stockReservationExpiresAt!,
                message: 'Nuovo PaymentIntent creato per ordine esistente.',
              };
            } else {
              // Stock reservation scaduta
              this.logger.log(
                `⏰ Stock reservation scaduta per ${existingOrder.orderNumber}, cancello`,
              );

              if (existingOrder.stockReserved) {
                await this.ordersService['inventoryService'].releaseReservation(
                  existingOrder.id,
                  'Stock reservation scaduta - nuovo checkout',
                  manager,
                );
              }

              await manager.update(Order, existingOrder.id, {
                status: OrderStatus.CANCELLED,
                notes:
                  (existingOrder.notes || '') +
                  '\nCancellato: stock reservation scaduta',
              });
            }
          } else {
            // Carrello MODIFICATO
            this.logger.log(
              `🔄 Carrello modificato, cancello ordine ${existingOrder.orderNumber}`,
            );

            if (existingOrder.stockReserved) {
              await this.ordersService['inventoryService'].releaseReservation(
                existingOrder.id,
                'Carrello modificato - nuovo checkout',
                manager,
              );
            }

            await manager.update(Order, existingOrder.id, {
              status: OrderStatus.CANCELLED,
              notes:
                (existingOrder.notes || '') + '\nCancellato: carrello modificato',
            });
          }
        }

        // 5. PROSEGUI con creazione nuovo ordine
        logProgress('START: Validate checkout data');
        this.validateCheckoutData(checkoutData);
        logProgress('DONE: Validate checkout data');

        logProgress('START: Resolve customer email');
        const customerEmail = await this.resolveCustomerEmail(ctx, checkoutData);
        logProgress('DONE: Resolve customer email');

        // Valida carrello per checkout
        logProgress('START: Validate cart for checkout');
        const cartValidation = await this.cartService.validateCartForCheckout(
          ctx.key,
          ctx.type,
        );
        logProgress('DONE: Validate cart for checkout');

        if (!cartValidation.valid) {
          throw new BadRequestException(
            `Carrello non valido: ${cartValidation.errors.join(', ')}`,
          );
        }

        // Ottieni cart con totali
        logProgress('START: Get cart with totals');
        const cartDto = await this.cartService.getCartWithTotals(ctx.key, ctx.type);
        logProgress('DONE: Get cart with totals');

        if (!cartDto || cartDto.items.length === 0) {
          throw new BadRequestException('Carrello vuoto');
        }

        // 6. Ensure User (guest o customer)
        logProgress('START: Ensure user');
        let userEntity: User | null;

        if (ctx.type === 'guest') {
          this.logger.log(
            `👤 [Checkout] Ensure guest by email START: email=${customerEmail}, userId=${ctx.key}`,
          );

          try {
            userEntity = await this.addressService.ensureGuestByEmail(
              customerEmail!,
              {
                name: `${checkoutData.shippingAddress.firstName} ${checkoutData.shippingAddress.lastName}`.trim(),
                phone: checkoutData.shippingAddress.phone,
                userId: ctx.key,
              },
              manager,
            );
          } catch (e) {
            this.logger.error(
              `❌ [Checkout] ensureGuestByEmail FAILED: userId=${ctx.key}, email=${customerEmail} - ${e?.message}`,
              e,
            );
            throw e;
          }

          if (!userEntity) {
            this.logger.error(
              `❌ [Checkout] ensureGuestByEmail returned null: userId=${ctx.key}, email=${customerEmail}`,
            );
            throw new BadRequestException('Errore creazione guest per checkout');
          }

          this.logger.log(`✅ [Checkout] Guest user ensured OK: ${userEntity.id}`);
        } else {
          userEntity = await manager.findOne(User, {
            where: { id: ctx.key },
          });

          if (!userEntity) {
            throw new BadRequestException(`Utente ${ctx.key} non trovato`);
          }

          this.logger.log(`✅ Customer user found: ${userEntity.id}`);
        }
        logProgress('DONE: Ensure user');

        // SECURITY: Acquisisci lock prima di creare l'ordine
        logProgress('START: Acquire checkout lock');
        const tempOrderId = `temp-${Date.now()}-${ctx.key}`;
        const lockResult = await this.duplicateOrderGuard.acquireLock(
          checkoutLockKey!,
          tempOrderId,
        );

        if (!lockResult.acquired && lockResult.existingOrderId) {
          // Lock già acquisito da un altro processo
          throw new ConflictException(
            `Checkout già in corso. Ordine esistente: ${lockResult.existingOrderId}`,
          );
        }
        logProgress('DONE: Acquire checkout lock');

        const order = await this.ordersService.createOrderFromCartWithReservation(
          userEntity.id,
          {
            shippingAddress: checkoutData.shippingAddress.toLegacyFormat(),
            billingAddress:
              checkoutData.billingAddress?.toLegacyFormat() ||
              checkoutData.shippingAddress.toLegacyFormat(),
            notes: checkoutData.notes,
            couponCode: checkoutData.couponCode,
            customerEmail,
            userType: ctx.type,
            userId: userEntity.id,
            invoiceRequested: checkoutData.invoiceRequested,
          },
          manager,
        );

        // SECURITY: Aggiorna il lock con l'orderId reale
        await this.duplicateOrderGuard.updateLock(checkoutLockKey!, order.id);

        await this.saveAddressesFromOrder(order, checkoutData, userEntity, manager);
        logProgress('DONE: Save addresses from order');

        logProgress('START: Create payment intent for order');
        const paymentResult = await this.paymentsService.createPaymentIntentForOrder(
          order.id,
          manager,
        );
        logProgress('DONE: Create payment intent for order');

        return {
          success: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentIntentId: paymentResult.paymentIntentId,
          clientSecret: paymentResult.clientSecret,
          customerId: paymentResult.customerId,
          ephemeralKey: paymentResult.ephemeralKey,
          amount: paymentResult.amount,
          currency: paymentResult.currency || 'eur',
          stockReservedUntil: order.stockReservationExpiresAt ?? new Date(),
          message: 'Ordine creato con successo. Completa il pagamento per confermare.',
        };
      } catch (error) {
        logProgress(`ERROR at ${Date.now() - startTime}ms`);
        this.logger.error('❌ Errore initElements:', error);
        throw error;
      }
    });
  }

  /**
   * ✅ FIX: Salva indirizzi da ordine nella tabella addresses
   */
  private async saveAddressesFromOrder(
    order: Order,
    checkoutData: CheckoutDto,
    userEntity: User,
    manager: EntityManager,
  ): Promise<void> {
    try {
      const userId = userEntity?.id;

      if (!userId) {
        this.logger.warn(`⚠️ Nessun userId per ordine ${order.orderNumber}`);
        return;
      }

      const shouldSaveShipping = true;

      if (shouldSaveShipping && order.shippingAddress) {
        try {
          const savedShipping = await this.addressService.saveAddressFromCheckout(
            order.shippingAddress,
            userId,
            'shipping',
            manager,
          );

          if (savedShipping) {
            this.logger.log(`📍 Indirizzo spedizione salvato: ${savedShipping.id}`);
          }
        } catch (addrError) {
          this.logger.error(
            `❌ Errore salvataggio indirizzo spedizione: ${addrError.message}`,
          );
        }
      }

      // ✅ Salva indirizzo fatturazione (se diverso e richiesto)
      const billingAddress = order.billingAddress;
      const shouldSaveBilling =
        (userEntity.role === UserRole.GUEST || // Sempre per guest
          checkoutData.billingAddress?.saveAddress === true) && // Solo se richiesto per customer
        !!billingAddress &&
        JSON.stringify(billingAddress) !== JSON.stringify(order.shippingAddress);

      if (shouldSaveBilling && billingAddress) {
        try {
          const savedBilling = await this.addressService.saveAddressFromCheckout(
            billingAddress,
            userId,
            'billing',
            manager,
          );

          if (savedBilling) {
            this.logger.log(`📍 Indirizzo fatturazione salvato: ${savedBilling.id}`);
          }
        } catch (addrError) {
          this.logger.error(
            `❌ Errore salvataggio indirizzo fatturazione: ${addrError.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ Errore generale salvataggio indirizzi ordine ${order.orderNumber}:`,
        error,
      );
    }
  }
  /**
   * Conferma pagamento Elements
   *
   * Nota: La conferma effettiva avviene nel webhook.
   * Questo endpoint è solo per polling dello stato.
   */
  async confirmElementsPayment(paymentIntentId: string): Promise<{
    success: boolean;
    status: string;
    orderId?: string;
    orderNumber?: string;
    message: string;
  }> {
    try {
      this.logger.log(`🔍 Verifica stato payment: ${paymentIntentId}`);

      // Cerca ordine tramite PI
      const order = await this.ordersService.findByPaymentIntentId(paymentIntentId);

      if (!order) {
        return {
          success: false,
          status: 'pending',
          message: 'Ordine non ancora confermato. Attendi il webhook.',
        };
      }

      if (order.status === OrderStatus.CONFIRMED) {
        return {
          success: true,
          status: 'succeeded',
          orderId: order.id,
          orderNumber: order.orderNumber,
          message: 'Pagamento completato con successo!',
        };
      }

      if (order.status === OrderStatus.CANCELLED) {
        return {
          success: false,
          status: 'failed',
          orderId: order.id,
          orderNumber: order.orderNumber,
          message: 'Pagamento fallito o cancellato.',
        };
      }

      return {
        success: false,
        status: 'processing',
        orderId: order.id,
        orderNumber: order.orderNumber,
        message: 'Pagamento in elaborazione...',
      };
    } catch (error) {
      this.logger.error('❌ Errore verifica payment:', error);
      throw error;
    }
  }

  // ===========================
  // 📋 ADDRESS MANAGEMENT
  // ===========================

  /**
   * Ottieni indirizzi salvati per pre-compilazione checkout
   */
  async getCheckoutAddresses(user: any): Promise<{
    shipping: any[];
    billing: any[];
    defaultShipping?: any;
    defaultBilling?: any;
    suggestions: {
      useDefaultShipping: boolean;
      useDefaultBilling: boolean;
      canAutoFill: boolean;
    };
  }> {
    const ctx = this.resolveCartContext(user);

    try {
      const userId = ctx.key;

      const addresses = await this.addressService.getAddressesForCheckout(userId);

      return {
        shipping: this.formatAddresses(addresses.shipping),
        billing: this.formatAddresses(addresses.billing),
        defaultShipping: addresses.defaultShipping
          ? this.formatAddress(addresses.defaultShipping)
          : undefined,
        defaultBilling: addresses.defaultBilling
          ? this.formatAddress(addresses.defaultBilling)
          : undefined,
        suggestions: {
          useDefaultShipping: !!addresses.defaultShipping,
          useDefaultBilling: !!addresses.defaultBilling,
          canAutoFill: !!addresses.defaultShipping || !!addresses.defaultBilling,
        },
      };
    } catch (error) {
      this.logger.error('❌ Errore recupero indirizzi checkout:', error);
      return {
        shipping: [],
        billing: [],
        suggestions: {
          useDefaultShipping: false,
          useDefaultBilling: false,
          canAutoFill: false,
        },
      };
    }
  }

  // ===========================
  // 📊 ORDER STATUS & TRACKING
  // ===========================

  /**
   * Ottieni stato checkout/ordine
   */
  async getCheckoutStatus(orderId: string): Promise<{
    order: any;
    payment: any;
    timeline: any[];
    canRetry: boolean;
  }> {
    try {
      this.logger.log(`📊 Stato checkout ordine: ${orderId}`);

      const order = await this.ordersService.findOne(orderId);
      const payment = await this.paymentsService.findByOrderId(orderId);

      return {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          subtotal: order.subtotal,
          shippingCost: order.shippingCost,
          taxAmount: order.taxAmount || 0,
          total: order.total,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          trackingNumber: order.trackingNumber,
          brtTrackingNumber: order.brtTrackingNumber,
          estimatedDelivery: order.estimatedDelivery,
          stockReserved: order.stockReserved,
          stockReservationExpiresAt: order.stockReservationExpiresAt,
          canBeCancelled: order.isCancellable(),
          canBeShipped: order.canBeShipped(),
        },
        payment: payment
          ? {
            id: payment.id,
            status: payment.status,
            method: payment.method,
            amount: payment.amount,
            currency: payment.currency,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            createdAt: payment.createdAt,
          }
          : null,
        timeline: this.generateOrderTimeline(order, payment),
        canRetry: this.canRetryPayment(order),
      };
    } catch (error) {
      this.logger.error('❌ Errore stato checkout:', error);
      throw error;
    }
  }

  /**
   * Retry pagamento per ordine PENDING
   */
  async retryPayment(orderId: string): Promise<{
    success: boolean;
    orderId: string;
    orderNumber: string;
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
  }> {
    try {
      this.logger.log(`🔄 Retry pagamento ordine: ${orderId}`);

      const order = await this.ordersRepository.findOne({
        where: { id: orderId },
        relations: ['items', 'items.variant', 'items.variant.product'],
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      if (!this.canRetryPayment(order)) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non può essere pagato (stato: ${order.status})`,
        );
      }

      // Verifica che stock reservation sia ancora valida
      if (
        order.stockReservationExpiresAt &&
        order.stockReservationExpiresAt < new Date()
      ) {
        throw new BadRequestException('Stock reservation scaduta. Ripeti il checkout.');
      }

      // Crea nuovo PaymentIntent
      const paymentResult = await this.paymentsService.createPaymentIntentForOrder(
        order.id,
      );

      this.logger.log(
        `✅ Nuovo PaymentIntent creato per ${order.orderNumber}: ` +
        `${paymentResult.paymentIntentId}`,
      );

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentResult.paymentIntentId,
        clientSecret: paymentResult.clientSecret,
        amount: paymentResult.amount,
        currency: paymentResult.currency || 'eur',
      };
    } catch (error) {
      this.logger.error('❌ Errore retry pagamento:', error);
      throw error;
    }
  }

  // ===========================
  // 🛠️ PRIVATE HELPER METHODS
  // ===========================

  /**
   * Calcola hash del carrello per idempotenza.
   * Include couponCode per evitare riuso di PENDING order con coupon diverso.
   */
  private calculateCartHash(items: CartItem[], couponCode?: string): string {
    if (!items || items.length === 0) {
      return '';
    }

    const itemsStr = items
      .map((item) => `${item.variantId}:${item.quantity}`)
      .sort()
      .join('|');

    const couponSuffix = couponCode ? `|coupon:${couponCode.toUpperCase()}` : '';

    return createHash('md5').update(itemsStr + couponSuffix).digest('hex');
  }

  /**
   * Calcola hash items ordine (include couponCode per confronto corretto)
   */
  private calculateOrderItemsHash(items: OrderItem[], couponCode?: string): string {
    const itemsStr = items
      .map((item) => `${item.variantId}:${item.quantity}`)
      .sort()
      .join('|');

    const couponSuffix = couponCode ? `|coupon:${couponCode.toUpperCase()}` : '';

    return createHash('md5').update(itemsStr + couponSuffix).digest('hex');
  }


  private resolveCartContext(user: any): CartContext {
    this.logger.debug('🔍 Resolve cart context - Input:', {
      type: user?.type,
      id: user?.id,
      sub: user?.sub,
    });

    // ✅ GUEST: Usa userId
    if (user?.type === 'guest') {
      const userId = user.id;

      if (!userId) {
        this.logger.error('❌ Guest senza userId:', user);
        throw new BadRequestException('Guest user ID mancante');
      }

      this.logger.log(`✅ Guest cart context: ${userId}`);
      return { key: userId, type: 'guest' };
    }

    if (user?.type === 'customer' || user?.role === 'customer') {
      const userId = user.id || user.sub;

      if (!userId) {
        this.logger.error('❌ Customer senza userId:', user);
        throw new BadRequestException('User ID mancante');
      }

      this.logger.log(`✅ Customer cart context: ${userId}`);
      return { key: userId, type: 'customer' };
    }

    this.logger.error('❌ User type non riconosciuto:', user);
    throw new BadRequestException(`Tipo utente non valido: ${user?.type || 'undefined'}`);
  }

  /**
   * Risolve email cliente
   */
  private async resolveCustomerEmail(
    ctx: CartContext,
    checkoutData: CheckoutDto,
  ): Promise<string> {
    let email = checkoutData.customerEmail?.trim().toLowerCase();

    if (ctx.type === 'guest') {
      if (!email) {
        throw new BadRequestException('Email obbligatoria per checkout guest');
      }
      return email;
    }

    // Registered user - recupera da DB se non fornita
    if (!email) {
      const user = await this.userRepository.findOne({
        where: { id: ctx.key },
      });
      if (!user?.email) {
        throw new BadRequestException('Impossibile recuperare email utente');
      }
      email = user.email.toLowerCase();
    }

    return email;
  }

  /**
   * Valida dati checkout
   */
  private validateCheckoutData(checkoutData: CheckoutDto): void {
    if (!checkoutData.shippingAddress) {
      throw new BadRequestException('Indirizzo di spedizione richiesto');
    }

    const shipping = checkoutData.shippingAddress.toLegacyFormat();

    if (
      !shipping.name ||
      !shipping.street ||
      !shipping.city ||
      !shipping.postalCode ||
      !shipping.country
    ) {
      throw new BadRequestException('Indirizzo di spedizione incompleto');
    }

    // Validazione CAP italiano
    if (['italy', 'italia', 'IT', 'it'].includes(String(shipping.country))) {
      if (!/^\d{5}$/.test(shipping.postalCode)) {
        throw new BadRequestException(
          'CAP non valido per Italia (deve essere 5 cifre)',
        );
      }
    }
  }


  /**
   * Verifica se ordine può essere ripagato
   */
  private canRetryPayment(order: Order): boolean {
    return [OrderStatus.PENDING, OrderStatus.PROCESSING].includes(order.status);
  }

  /**
   * Genera timeline ordine per visualizzazione
   */
  private generateOrderTimeline(order: Order, payment: any): any[] {
    const timeline: any[] = [];

    // Ordine creato
    timeline.push({
      status: 'created',
      timestamp: order.createdAt,
      title: 'Ordine Creato',
      description: `Ordine ${order.orderNumber} creato`,
      icon: '📝',
    });

    // Stock riservato
    if (order.stockReservedAt) {
      timeline.push({
        status: 'reserved',
        timestamp: order.stockReservedAt,
        title: 'Stock Riservato',
        description: 'Prodotti riservati per 2 ore',
        icon: '🔒',
      });
    }

    // Pagamento
    if (payment) {
      const paymentIcon =
        payment.status === 'succeeded'
          ? '✅'
          : payment.status === 'processing'
            ? '⏳'
            : '❌';
      timeline.push({
        status: 'payment',
        timestamp: payment.createdAt,
        title: 'Pagamento',
        description: `Pagamento ${payment.status}`,
        icon: paymentIcon,
      });
    }

    // Stati ordine
    const statusMap = {
      [OrderStatus.CONFIRMED]: {
        title: 'Confermato',
        description: 'Ordine confermato e in lavorazione',
        icon: '✅',
      },
      [OrderStatus.PROCESSING]: {
        title: 'In Preparazione',
        description: 'Il tuo ordine è in preparazione',
        icon: '📦',
      },
      [OrderStatus.READY_TO_SHIP]: {
        title: 'Pronto per Spedizione',
        description: 'Etichetta creata, in attesa ritiro corriere',
        icon: '📋',
      },
      [OrderStatus.SHIPPED]: {
        title: 'Spedito',
        description: order.brtTrackingNumber
          ? `Tracking: ${order.brtTrackingNumber}`
          : 'Ordine spedito',
        icon: '🚚',
      },
      [OrderStatus.IN_TRANSIT]: {
        title: 'In Transito',
        description: 'Il pacco è in viaggio',
        icon: '📍',
      },
      [OrderStatus.OUT_FOR_DELIVERY]: {
        title: 'In Consegna',
        description: 'Il corriere sta consegnando il pacco',
        icon: '🚛',
      },
      [OrderStatus.DELIVERED]: {
        title: 'Consegnato',
        description: 'Ordine consegnato con successo',
        icon: '🎉',
      },
      [OrderStatus.CANCELLED]: {
        title: 'Cancellato',
        description: 'Ordine cancellato',
        icon: '❌',
      },
      [OrderStatus.REFUNDED]: {
        title: 'Rimborsato',
        description: 'Ordine rimborsato',
        icon: '💰',
      },
    };

    if (statusMap[order.status]) {
      timeline.push({
        status: order.status,
        timestamp: order.updatedAt,
        ...statusMap[order.status],
      });
    }

    return timeline.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Formatta indirizzi per response
   */
  private formatAddresses(addresses: any[]): any[] {
    return addresses.map((addr) => this.formatAddress(addr));
  }

  /**
   * Formatta singolo indirizzo per response
   */
  private formatAddress(addr: any): any {
    return {
      id: addr.id,
      name: addr.name,
      street: addr.street,
      city: addr.city,
      postalCode: addr.postalCode,
      country: addr.country,
      phone: addr.phone,
      company: addr.company,
      vatNumber: addr.vatNumber,
      isDefault: addr.isDefault,
      lastUsed: addr.lastUsedAt,
      usageCount: addr.usageCount,
    };
  }
}