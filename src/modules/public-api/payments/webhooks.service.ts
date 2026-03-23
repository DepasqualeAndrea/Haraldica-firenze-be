// src/modules/public-api/payments/webhook.service.ts

import {
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import Stripe from "stripe";

// Entities
import { Order, OrderStatus, OrderType } from "src/database/entities/order.entity";
import { Payment, PaymentMethod, PaymentStatus } from "src/database/entities/payment.entity";
import { User } from "src/database/entities/user.entity";

// Services
import { OrdersService } from "../orders/orders.service";
import { CartService } from "../cart/cart.service";
import { StripeService } from "./stripe.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private ordersService: OrdersService,
    private cartService: CartService,
    private stripeService: StripeService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) { }

  // ===========================
  // 🎯 MAIN EVENT HANDLER
  // ===========================

  async handleEvent(event: {
    id: string;
    type: string;
    data: { object: any };
  }): Promise<void> {
    const eventId = event.id;
    const eventType = event.type;

    this.logger.log(`📨 [${eventId}] Ricevuto: ${eventType}`);

    try {
      switch (eventType) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent
          );
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(
            event.data.object as Stripe.PaymentIntent
          );
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentIntentCanceled(
            event.data.object as Stripe.PaymentIntent
          );
          break;

        case 'payment_intent.processing':
          await this.handlePaymentIntentProcessing(
            event.data.object as Stripe.PaymentIntent
          );
          break;

        case 'charge.refund.created':
        case 'refund.created':
          await this.handleRefundCreated(event.data.object as Stripe.Refund);
          break;

        case 'charge.refund.updated':
        case 'refund.updated':
          await this.handleRefundUpdated(event.data.object as Stripe.Refund);
          break;

        case 'customer.created':
          await this.handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        case 'customer.deleted':
          await this.handleCustomerDeleted(event.data.object as Stripe.Customer);
          break;

        case 'charge.dispute.created':
          await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
          break;

        case 'charge.dispute.closed':
          await this.handleDisputeClosed(event.data.object as Stripe.Dispute);
          break;

        case 'checkout.session.completed':
          this.logger.log(
            `ℹ️ checkout.session.completed ricevuto - ` +
            `già gestito da payment_intent.succeeded`
          );
          break;

        case 'checkout.session.expired':
          await this.handleCheckoutExpired(
            event.data.object as Stripe.Checkout.Session
          );
          break;

        default:
          this.logger.warn(`⚠️ [${eventId}] Evento non gestito: ${eventType}`);
          break;
      }

      this.logger.log(`✅ [${eventId}] Completato: ${eventType}`);
    } catch (error) {
      this.logger.error(
        `❌ [${eventId}] Errore gestione ${eventType}:`,
        error.stack
      );
      throw error;
    }
  }

  // ===========================
  // 💳 PAYMENT INTENT HANDLERS
  // ===========================

  private async handlePaymentIntentSucceeded(
    pi: Stripe.PaymentIntent
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`🔄 Processing payment_intent. succeeded:  ${pi.id}`);

      // 1. Estrai metadata
      const orderId = pi.metadata?.orderId;

      if (!orderId) {
        this.logger.error(
          `❌ PI ${pi.id} senza orderId nei metadata.  ` +
          `Metadata: ${JSON.stringify(pi.metadata)}`
        );

        // ✅ NON lanciare errore per eventi senza orderId
        this.logger.warn(`⚠️ Skip processing per PI ${pi.id} - orderId mancante`);
        return; // Exit gracefully
      }

      // 2. IDEMPOTENZA - Check PRIMA di caricare ordine
      const existingPayment = await manager.findOne(Payment, {
        where: { stripePaymentIntentId: pi.id },
        relations: ['order']
      });

      if (existingPayment?.order?.status === OrderStatus.CONFIRMED) {
        this.logger.log(
          `🔁 PI ${pi.id} già processato. ` +
          `Ordine ${existingPayment.order.orderNumber} già CONFIRMED`
        );
        return;
      }

      // 3.  Carica ordine con lock pessimistico
      const lockedOrder = await manager
        .createQueryBuilder(Order, 'order')
        .setLock('pessimistic_write')
        .where('order.id = :orderId', { orderId })
        .getOne();

      if (!lockedOrder) {
        // ✅ Verifica età evento prima di lanciare errore
        const piCreatedAt = new Date(pi.created * 1000);
        const ageMinutes = (Date.now() - pi.created * 1000) / 1000 / 60;

        this.logger.error(
          `❌ Ordine ${orderId} non trovato per PI ${pi.id}. ` +
          `PI creato ${ageMinutes.toFixed(0)} minuti fa:  ${piCreatedAt.toISOString()}`
        );

        // ✅ Se evento vecchio (> 10 minuti), skip senza errore
        if (ageMinutes > 10) {
          this.logger.warn(
            `⏰ Evento vecchio (${ageMinutes.toFixed(0)}min), ` +
            `ordine probabilmente cancellato.  Skip processing. `
          );
          return; // Exit gracefully
        }

        // Se evento recente, è un vero errore
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      // 4. Carica ordine completo con relazioni
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['items', 'items.variant', 'items.variant.product', 'user']
      });

      if (!order) {
        // ✅ Questo non dovrebbe mai accadere dopo il lock, ma per sicurezza
        this.logger.error(`❌ Ordine ${orderId} non trovato dopo lock per PI ${pi.id}`);
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      // 5. Verifica stato ordine
      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `⚠️ Ordine ${order.orderNumber} già in stato ${order.status}. ` +
          `Skip conferma. `
        );
        return;
      }

      this.logger.log(
        `📦 Ordine trovato:  ${order.orderNumber} (${order.orderType}) - ` +
        `Items: ${order.items.length}`
      );

      // 6. ✨ CONFERMA STOCK RESERVATIONS → scala stock definitivo
      try {
        await this.ordersService['inventoryService'].confirmReservation(
          orderId,
          manager
        );
        this.logger.log(`✅ Stock reservations confermate per ordine ${order.orderNumber}`);
      } catch (error) {
        this.logger.error(
          `❌ Errore conferma stock per ordine ${order.orderNumber}: ${error.message}`
        );
        throw error; // Rollback transaction
      }

      // 7.  Crea o aggiorna Payment record
      let payment = existingPayment;

      const latestChargeId = pi.latest_charge
        ? (typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id)
        : undefined;

      let chargeDetails: any = undefined;

      if (latestChargeId) {
        try {
          const charge = await this.stripeService['stripe'].charges.retrieve(latestChargeId);
          chargeDetails = charge.payment_method_details;
        } catch (error) {
          this.logger.warn(`⚠️ Could not retrieve charge details: ${error.message}`);
        }
      }

      // ===========================
      // 💰 ESTRAZIONE DATI STRIPE (Tax, Shipping, Metadata)
      // ===========================

      // Tax data from PaymentIntent
      const taxAmountCents = (pi as any).amount_details?.tax?.amount || 0;
      const taxAmountEur = taxAmountCents / 100;
      const taxCountry = pi.shipping?.address?.country || 'IT';
      const automaticTaxStatus = (pi as any).automatic_tax?.status || 'not_enabled';

      // Costruisci stripeTaxDetails per salvare nell'ordine
      const stripeTaxDetails = {
        taxAmount: taxAmountEur,
        taxCountry,
        automaticTaxStatus,
        calculatedAt: new Date().toISOString(),
      };

      // Shipping cost - recupera dalla configurazione o dai metadata
      const shippingConfig = this.configService.get('stripe.shipping');
      const freeShippingThreshold = shippingConfig?.freeShippingThreshold || 50;
      const standardShippingCost = shippingConfig?.standardShippingCost || 5.90;

      // Calcola shipping: se subtotal >= soglia -> gratis, altrimenti costo standard
      // Nota: se il coupon è già stato applicato (es. FREE_SHIPPING), preserva lo shippingCost dell'ordine
      const calculatedShippingCost = order.couponCode
        ? order.shippingCost   // già impostato correttamente al momento della creazione ordine
        : (order.subtotal >= freeShippingThreshold ? 0 : standardShippingCost);

      // Salva stripeMetadata completo
      const stripeMetadata = {
        paymentIntentId: pi.id,
        paymentIntentStatus: pi.status,
        customerId: pi.customer as string,
        amount: pi.amount / 100,
        currency: pi.currency,
        taxAmount: taxAmountEur,
        shippingCost: calculatedShippingCost,
        capturedAt: new Date().toISOString(),
        chargeId: latestChargeId,
        paymentMethod: chargeDetails?.type || 'card',
      };

      this.logger.log(
        `📊 Stripe Data estratti: Tax €${taxAmountEur} (${taxCountry}), ` +
        `Shipping €${calculatedShippingCost}, Total €${pi.amount / 100}`
      );

      if (!payment) {
        payment = manager.create(Payment, {
          orderId: order.id,
          amount: pi.amount / 100,
          currency: pi.currency || 'eur',
          status: PaymentStatus.SUCCEEDED,
          method: PaymentMethod.CARD,
          stripePaymentIntentId: pi.id,
          stripeCustomerId: (pi.customer as string) || undefined,
          stripeChargeId: latestChargeId,
          stripePaymentMethodDetails: chargeDetails,
          metadata: {
            paymentIntentStatus: pi.status,
            capturedAt: new Date().toISOString(),
            amount: pi.amount / 100,
            currency: pi.currency,
            taxAmount: taxAmountEur,
            taxCountry: taxCountry,
            taxCalculationStatus: automaticTaxStatus
          },
        });

        await manager.save(Payment, payment);
        this.logger.log(`💰 Payment record creato: ${payment.id}`);
      } else {
        await manager.update(Payment, payment.id, {
          status: PaymentStatus.SUCCEEDED,
          stripeChargeId: latestChargeId,
          stripePaymentMethodDetails: chargeDetails,
          metadata: {
            ...(payment.metadata || {}),
            paymentIntentStatus: pi.status as string,
            capturedAt: new Date().toISOString(),
            taxAmount: taxAmountEur,
            taxCountry: taxCountry,
            taxCalculationStatus: automaticTaxStatus
          } as any,
        });
        this.logger.log(`💰 Payment record aggiornato:  ${payment.id}`);
      }

      // 8. ✅ AGGIORNA ORDINE → CONFIRMED con tutti i dati Stripe
      await manager.update(Order, order.id, {
        status: OrderStatus.CONFIRMED,
        stripePaymentIntentId: pi.id,
        stockReserved: false,
        stockReservedAt: undefined,
        stockReservationExpiresAt: undefined,
        // ✅ NUOVI CAMPI: Salva dati Stripe
        shippingCost: calculatedShippingCost,
        taxAmount: taxAmountEur,
        stripeTaxDetails: stripeTaxDetails as any,
        stripeMetadata: stripeMetadata as any,
      });

      this.logger.log(
        `📝 Ordine ${order.orderNumber} → CONFIRMED | ` +
        `Shipping: €${calculatedShippingCost} | Tax: €${taxAmountEur}`
      );

      order.status = OrderStatus.CONFIRMED;
      order.stripePaymentIntentId = pi.id;
      order.stockReserved = false;
      order.shippingCost = calculatedShippingCost;
      order.taxAmount = taxAmountEur;

      // 8.5 ✅ INCREMENTA usedCount COUPON (atomico, non blocca il flusso)
      if (order.couponCode) {
        try {
          await manager
            .createQueryBuilder()
            .update('coupons')
            .set({ usedCount: () => '"usedCount" + 1' })
            .where('code = :code', { code: order.couponCode })
            .execute();
          this.logger.log(`🏷️ Coupon ${order.couponCode} usedCount incrementato per ordine ${order.orderNumber}`);
        } catch (couponError) {
          // Non-fatal: il pagamento è già confermato
          this.logger.error(`❌ Errore incremento usedCount coupon ${order.couponCode}: ${couponError.message}`);
        }
      }

      // 9. ✅ AGGIORNA STATISTICHE UTENTE
      if (order.user) {
        try {
          const userStats = await manager
            .createQueryBuilder(Order, 'o')
            .select('COUNT(o.id)', 'totalOrders')
            .addSelect('COALESCE(SUM(o.total), 0)', 'totalSpent')
            .where('o.userId = :userId', { userId: order.user.id })
            .andWhere('o.status IN (:...statuses)', {
              statuses: [OrderStatus.CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
            })
            .getRawOne();

          await manager.update(User, order.user.id, {
            totalOrders: Number(userStats.totalOrders) || 0,
            totalSpent: Number(userStats.totalSpent) || 0,
            lastOrderDate: new Date(),
          });

          this.logger.log(
            `📊 User stats aggiornate: ${order.user.email} - ` +
            `Orders: ${userStats.totalOrders}, Spent: €${userStats.totalSpent}`
          );
        } catch (statsError) {
          this.logger.error(`❌ Errore aggiornamento stats utente: ${statsError.message}`);
          // Non blocchiamo il flusso per errore stats
        }
      }

      // 10. Clear cart
      try {
        await this.clearCartAfterOrder(order, manager);
      } catch (error) {
        this.logger.error(
          `❌ Errore svuotamento cart per ordine ${order.orderNumber}: ${error.message}`
        );
      }

      // 11. Salva indirizzo (se presente)
      if (order.shippingAddress && order.userId) {
        try {
          await this.ordersService['addressService'].saveAddressFromCheckout(
            order.shippingAddress,
            order.userId,
            'shipping',
            manager
          );
          this.logger.log(`📍 Address salvato per ordine ${order.orderNumber}`);
        } catch (error) {
          this.logger.error(`❌ Errore salvataggio address: ${error.message}`);
        }
      }

      // 12. ❌ NO AUTO-CREATE SPEDIZIONE BRT
      // ✅ STRATEGIA 2: Admin creerà spedizione manualmente
      this.logger.log(
        `📦 [STRATEGIA 2] Ordine ${order.orderNumber} confermato. ` +
        `Spedizione BRT verrà creata manualmente da admin.`
      );

      // 13. Emit evento per notifiche/email
      try {
        this.eventEmitter.emit('order.confirmed', {
          order,
          user: order.user,
        });
      } catch (error) {
        this.logger.error(`❌ Errore emit evento order.confirmed: ${error.message}`);
      }

      this.logger.log(
        `🎉 PAYMENT SUCCEEDED COMPLETATO: ` +
        `Ordine ${order.orderNumber} - €${order.total} - ` +
        `Status: CONFIRMED (ready for warehouse processing)`
      );
    });
  }

  private async handlePaymentIntentFailed(
    pi: Stripe.PaymentIntent
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const orderId = pi.metadata?.orderId;

      if (!orderId) {
        this.logger.warn(`⚠️ PI failed senza orderId: ${pi.id}`);
        return;
      }

      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['user']
      });

      if (!order) {
        this.logger.warn(`⚠️ Ordine ${orderId} non trovato per PI failed`);
        return;
      }

      if (order.stockReserved || order.status === OrderStatus.PENDING) {
        await this.ordersService['inventoryService'].releaseReservation(
          orderId,
          `Payment failed: ${pi.last_payment_error?.message || 'Unknown error'}`,
          manager
        );
        this.logger.log(`🔓 Stock reservation rilasciata per ordine ${order.orderNumber}`);
      }

      await manager.update(Order, order.id, {
        status: OrderStatus.CANCELLED,
        notes: (order.notes || '') + `\nPagamento fallito: ${pi.last_payment_error?.message || 'Unknown'}`,
      });

      const payment = await manager.findOne(Payment, {
        where: { stripePaymentIntentId: pi.id }
      });

      if (payment) {
        await manager.update(Payment, payment.id, {
          status: PaymentStatus.FAILED,
          failureReason: pi.last_payment_error?.message || 'Payment failed',
        });
      }

      this.eventEmitter.emit('payment.failed', {
        order,
        payment,
        user: order.user,
        error: pi.last_payment_error,
        paymentIntentId: pi.id,
      });

      this.logger.log(
        `❌ Payment failed: Ordine ${order.orderNumber} cancellato, stock rilasciato`
      );
    });
  }

  /**
   * 🚫 Payment Intent Canceled
   */
  private async handlePaymentIntentCanceled(
    pi: Stripe.PaymentIntent
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const orderId = pi.metadata?.orderId;

      if (!orderId) {
        this.logger.warn(`⚠️ PI canceled senza orderId: ${pi.id}`);
        return;
      }

      const order = await manager.findOne(Order, {
        where: { id: orderId }
      });

      if (!order) {
        this.logger.warn(`⚠️ Ordine ${orderId} non trovato per PI canceled`);
        return;
      }

      if (order.stockReserved || order.status === OrderStatus.PENDING) {
        await this.ordersService['inventoryService'].releaseReservation(
          orderId,
          'Payment canceled by user',
          manager
        );
        this.logger.log(`🔓 Stock reservation rilasciata per ordine ${order.orderNumber}`);
      }

      await manager.update(Order, order.id, {
        status: OrderStatus.CANCELLED,
        notes: (order.notes || '') + '\nPagamento cancellato dall\'utente',
      });

      const payment = await manager.findOne(Payment, {
        where: { stripePaymentIntentId: pi.id }
      });

      if (payment) {
        await manager.update(Payment, payment.id, {
          status: PaymentStatus.CANCELLED,
          failureReason: 'Payment canceled',
        });
      }

      this.logger.log(
        `🚫 Payment canceled: Ordine ${order.orderNumber} cancellato, stock rilasciato`
      );
    });
  }

  /**
   * ⏳ Payment Intent Processing
   */
  private async handlePaymentIntentProcessing(
    pi: Stripe.PaymentIntent
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { stripePaymentIntentId: pi.id },
        relations: ['order']
      });

      if (payment) {
        await manager.update(Payment, payment.id, {
          status: PaymentStatus.PROCESSING,
        });

        this.logger.log(
          `⏳ Payment processing: Ordine ${payment.order.orderNumber}`
        );
      }
    });
  }

  // ===========================
  // 💰 REFUND HANDLERS
  // ===========================

  private async handleRefundCreated(refund: Stripe.Refund): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      let payment: Payment | null = null;

      if (refund.payment_intent) {
        payment = await manager.findOne(Payment, {
          where: { stripePaymentIntentId: refund.payment_intent as string },
          relations: ['order', 'order.user', 'order.items', 'order.items.variant', 'order.items.variant.product']
        });
      } else if (refund.charge) {
        payment = await manager.findOne(Payment, {
          where: { stripeChargeId: refund.charge as string },
          relations: ['order', 'order.user', 'order.items', 'order.items.variant', 'order.items.variant.product']
        });
      }

      if (!payment) {
        this.logger.warn(`⚠️ Payment non trovato per refund: ${refund.id}`);
        return;
      }

      const refundAmount = refund.amount / 100;
      const newRefundedAmount = payment.refundedAmount + refundAmount;
      const isFullRefund = newRefundedAmount >= payment.amount;

      const updateData: Partial<Payment> = {
        refundedAmount: newRefundedAmount,
        status: isFullRefund
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      };

      await manager.update(Payment, payment.id, updateData);

      if (isFullRefund) {
        await manager.update(Order, payment.order.id, {
          status: OrderStatus.REFUNDED,
        });

        for (const item of payment.order.items) {
          await this.ordersService['inventoryService'].recordReturnMovement(
            item.variantId,
            item.quantity,
            payment.order.id,
            undefined
          );
        }

        this.logger.log(
          `📦 Stock ripristinato per refund completo ordine ${payment.order.orderNumber}`
        );
      }

      this.eventEmitter.emit('refund.created', {
        payment,
        order: payment.order,
        user: payment.order.user,
        refund,
        refundAmount,
        isFullRefund,
      });

      this.logger.log(
        `💰 Rimborso ${isFullRefund ? 'COMPLETO' : 'PARZIALE'}: ` +
        `${refund.id} - €${refundAmount} per ${payment.order.orderNumber}`
      );
    });
  }

  private async handleRefundUpdated(refund: Stripe.Refund): Promise<void> {
    this.logger.log(
      `🔄 Refund updated: ${refund.id} - Status: ${refund.status}`
    );

    if (refund.status === 'failed') {
      this.logger.warn(`⚠️ Refund failed: ${refund.id} - ${refund.failure_reason}`);
    }
  }

  // ===========================
  // 👤 CUSTOMER HANDLERS
  // ===========================

  private async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    const email = customer.email;

    if (!email) {
      this.logger.warn(`⚠️ Customer ${customer.id} senza email`);
      return;
    }

    const user = await this.userRepository.findOne({ where: { email } });

    if (user && !user.stripeCustomerId) {
      await this.userRepository.update(user.id, {
        stripeCustomerId: customer.id,
      });
      this.logger.log(`🆕 Stripe Customer collegato: ${email} → ${customer.id}`);
    }
  }

  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { stripeCustomerId: customer.id },
    });

    if (!user) {
      this.logger.debug(`Customer ${customer.id} non collegato a nessun user`);
      return;
    }

    const updates: Partial<User> = {};

    if (customer.email && customer.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: customer.email }
      });

      if (!existingUser || existingUser.id === user.id) {
        updates.email = customer.email;
      } else {
        this.logger.warn(
          `⚠️ Email ${customer.email} già in uso, skip update`
        );
      }
    }

    if (customer.name) {
      const [firstName, ...lastNameParts] = customer.name.split(' ');
      if (firstName && firstName !== user.firstName) {
        updates.firstName = firstName;
      }
      const lastName = lastNameParts.join(' ');
      if (lastName && lastName !== user.lastName) {
        updates.lastName = lastName;
      }
    }

    if (customer.phone && customer.phone !== user.phone) {
      updates.phone = customer.phone;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(user.id, updates);

      this.logger.log(
        `🔄 Stripe → User sync: ${customer.id} → ${user.email} ` +
        `(${Object.keys(updates).join(', ')})`
      );
    } else {
      this.logger.debug(`ℹ️ Nessuna modifica da sincronizzare`);
    }
  }

  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { stripeCustomerId: customer.id },
    });

    if (user) {
      await this.userRepository.update(user.id, {
        stripeCustomerId: undefined,
      });
      this.logger.log(`🗑️ Stripe Customer disconnesso da user: ${user.email}`);
    }
  }

  // ===========================
  // ⚠️ DISPUTE HANDLERS
  // ===========================

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripeChargeId: dispute.charge as string },
      relations: ['order', 'order.user'],
    });

    if (!payment) {
      this.logger.warn(`⚠️ Payment non trovato per dispute: ${dispute.id}`);
      return;
    }

    this.eventEmitter.emit('dispute.created', {
      payment,
      order: payment.order,
      user: payment.order.user,
      dispute,
      amount: dispute.amount / 100,
      reason: dispute.reason,
      status: dispute.status,
    });

    this.logger.warn(
      `⚠️ CONTESTAZIONE CREATA: ${dispute.id} - ` +
      `Ordine ${payment.order.orderNumber} - ` +
      `€${dispute.amount / 100} - ` +
      `Motivo: ${dispute.reason}`
    );
  }

  private async handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    this.logger.log(
      `🔒 Dispute chiusa: ${dispute.id} - Status: ${dispute.status}`
    );

    this.eventEmitter.emit('dispute.closed', {
      dispute,
      status: dispute.status,
      outcome: dispute.status === 'won' ? 'Vinta' : 'Persa',
    });
  }

  // ===========================
  // 🛒 CHECKOUT SESSION HANDLERS
  // ===========================

  private async handleCheckoutExpired(
    session: Stripe.Checkout.Session
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const orderId = session.metadata?.orderId;

      if (!orderId) {
        this.logger.warn(`⚠️ Checkout expired senza orderId: ${session.id}`);
        return;
      }

      const order = await manager.findOne(Order, {
        where: { id: orderId }
      });

      if (!order) {
        this.logger.warn(`⚠️ Ordine ${orderId} non trovato per checkout expired`);
        return;
      }

      if (order.status === OrderStatus.PENDING && order.stockReserved) {
        await this.ordersService['inventoryService'].releaseReservation(
          orderId,
          'Checkout session expired',
          manager
        );

        await manager.update(Order, order.id, {
          status: OrderStatus.CANCELLED,
          notes: (order.notes || '') + '\nCheckout session scaduta',
        });

        this.logger.log(
          `⏰ Checkout expired: Ordine ${order.orderNumber} cancellato, ` +
          `stock rilasciato`
        );
      }
    });
  }

  // ===========================
  // 🧹 HELPER METHODS
  // ===========================

  private async clearCartAfterOrder(
    order: Order,
    manager?: any,
  ): Promise<void> {
    try {
      const cartKey = order.userId;
      const cartType: 'guest' | 'customer' =
        order.orderType === OrderType.GUEST ? 'guest' : 'customer';

      this.logger.log(`🔍 Clear cart attempt:`, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        userId: order.userId,
        cartKey,
        cartType,
      });

      if (!cartKey) {
        this.logger.error(
          `❌ CartKey (userId) mancante! Order: ${order.id}, Type: ${order.orderType}`
        );
        return;
      }

      this.logger.log(`🧹 Svuoto cart ${cartType}: ${cartKey}`);

      await this.cartService.clearCart(cartKey, cartType, manager);

      this.logger.log(`✅ Cart svuotato: ${cartType} - ${cartKey}`);
    } catch (error) {
      this.logger.error(
        `❌ Errore svuotamento cart ordine ${order.orderNumber}:`,
        error
      );
    }
  }
}