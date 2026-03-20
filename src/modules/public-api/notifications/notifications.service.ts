// src/modules/public-api/notifications/notifications.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';

// Entities
import { Order } from 'src/database/entities/order.entity';
import { User, UserRole } from 'src/database/entities/user.entity';

// Services
import { EmailService } from './email.service';
import { Return } from 'src/database/entities/return.entity';
import { RETURN_REASON_LABELS } from '../returns/enums/return-reason.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private emailService: EmailService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) { }

  // ===========================
  // 🛠️ HELPER: Resolve Email per User
  // ===========================

  /**
   * ✅ NUOVO: Risolve email corretta per user (gestisce guest con lastCheckoutEmail)
   */
  private resolveUserEmail(user?: User, fallbackEmail?: string | null): string | null {
    if (!user && !fallbackEmail) {
      return null;
    }

    // 1. Se user è GUEST → usa lastCheckoutEmail (priorità massima)
    if (user?.role === UserRole.GUEST) {
      const guestEmail = user.lastCheckoutEmail || fallbackEmail;
      
      if (!guestEmail) {
        this.logger.warn(`⚠️ Guest user ${user.id} senza lastCheckoutEmail e senza fallback`);
        return null;
      }

      this.logger.debug(`📧 Email guest risolta: ${guestEmail} (userId: ${user.id})`);
      return guestEmail;
    }

    // 2. Se user è CUSTOMER → usa email field
    if (user?.email) {
      return user.email;
    }

    // 3. Fallback finale
    if (fallbackEmail) {
      return fallbackEmail;
    }

    return null;
  }

  // ===========================
  // 🎧 EVENT HANDLERS
  // ===========================

  @OnEvent('order.created')
  async handleOrderCreated(payload: { order: Order; user?: User }) {
    this.logger.log(`📧 Event 'order.created': ${payload.order.orderNumber}`);

    // Email al cliente
    try {
      await this.sendOrderCreatedEmail(payload.order, payload.user);
    } catch (error) {
      this.logger.error('❌ Failed to send order created email:', error);
    }

    // Email all'admin
    try {
      await this.emailService.sendNewOrderAdmin({
        orderNumber: payload.order.orderNumber,
        customerEmail: payload.order.customerEmail || payload.user?.email || '',
        total: payload.order.total,
        items: payload.order.items || [],
      });
    } catch (error) {
      this.logger.error('❌ Failed to send admin notification:', error);
    }
  }

  @OnEvent('order.confirmed')
  async handleOrderConfirmed(payload: { order: Order; user?: User } | Order) {
    // ✅ FIX: Gestisci sia payload con wrapper che Order diretto
    let order: Order;
    let user: User | undefined;

    if ('order' in payload && payload.order) {
      order = payload.order;
      user = payload.user;
    } else if ('orderNumber' in payload) {
      order = payload as Order;
      user = undefined;
    } else {
      this.logger.error('❌ Invalid payload for order.confirmed event:', payload);
      return;
    }

    this.logger.log(`📧 Event 'order.confirmed': ${order.orderNumber}`);

    try {
      await this.sendOrderConfirmedEmail(order, user);
    } catch (error) {
      this.logger.error('❌ Failed to send order confirmed email:', error);
    }
  }

  @OnEvent('order.shipped')
  async handleOrderShipped(payload: {
    order: Order;
    user?: User;
    trackingNumber: string;
    trackingUrl?: string;
  }) {
    this.logger.log(`Event 'order.shipped': ${payload.order.orderNumber}`);
    try {
      await this.sendOrderShippedEmail(payload.order, payload.user, {
        trackingNumber: payload.trackingNumber,
        trackingUrl: payload.trackingUrl,
      });
    } catch (error) {
      this.logger.error('Failed to send order shipped email:', error);
    }
  }

  @OnEvent('order.cancelled')
  async handleOrderCancelled(payload: {
    order: Order;
    reason?: string;
  }) {
    this.logger.log(`Event 'order.cancelled': ${payload.order.orderNumber}`);
    try {
      await this.sendOrderCancelledEmail(payload.order, payload.reason);
    } catch (error) {
      this.logger.error('Failed to send order cancelled email:', error);
    }
  }

  @OnEvent('order.delivered')
  async handleOrderDelivered(payload: { order: Order; user?: User }) {
    this.logger.log(`📧 Event 'order.delivered': ${payload.order.orderNumber}`);
    try {
      await this.sendOrderDeliveredWithReviewCTA(payload.order, payload.user);
    } catch (error) {
      this.logger.error('❌ Failed to send order delivered email:', error);
    }
  }

  @OnEvent('payment.succeeded')
  async handlePaymentSucceeded(payload: { order: Order; user?: User }) {
    // Email già inviata da order.confirmed - skip duplicato
    this.logger.debug(`🔇 Payment succeeded - email già gestita da order.confirmed: ${payload.order.orderNumber}`);
  }

  @OnEvent('payment.failed')
  async handlePaymentFailed(payload: {
    order: Order;
    user?: User;
    reason: string;
  }) {
    this.logger.log(`📧 Event 'payment.failed': ${payload.order.orderNumber}`);
    try {
      await this.sendPaymentFailedEmail(
        payload.order,
        payload.user,
        payload.reason
      );
    } catch (error) {
      this.logger.error('❌ Failed to send payment failed email:', error);
    }
  }

  @OnEvent('refund.created')
  async handleRefundCreated(payload: {
    order: Order;
    user?: User;
    refundAmount: number;
    isFullRefund: boolean;
  }) {
    this.logger.log(`📧 Event 'refund.created': ${payload.order.orderNumber}`);
    try {
      await this.sendRefundProcessedEmail(payload.order, payload.user, {
        refundAmount: payload.refundAmount,
        isFullRefund: payload.isFullRefund,
        reason: 'Richiesto dal cliente',
        estimatedArrival: '5-10 giorni lavorativi',
      });
    } catch (error) {
      this.logger.error('❌ Failed to send refund email:', error);
    }
  }

  // ===========================
  // 📦 ORDER EMAILS
  // ===========================

  private async sendOrderCreatedEmail(
    order: Order,
    user?: User
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);
      
      if (!email) {
        this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
        return false;
      }

      return await this.emailService.sendOrderCreated({
        email,
        orderNumber: order.orderNumber,
        total: order.total,
        items: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          price: item.unitPrice,
          image: (item.variant?.product as any)?.images?.[0],
        })),
        shippingAddress: order.shippingAddress,
      });
    } catch (error) {
      this.logger.error('❌ Error sending order created email:', error);
      return false;
    }
  }

  async sendGuestOrderConfirmation(payload: {
    order: Order;
    email: string;
  }): Promise<void> {
    try {
      const { order, email } = payload;

      const emailData = {
        to: email,
        subject: `Conferma ordine ${order.orderNumber} - Haraldica Firenze`,
        template: 'order-confirmation-guest',
        context: {
          orderNumber: order.orderNumber,
          customerEmail: email,
          total: order.total,
          items: order.items.map(item => ({
            name: item.productName,
            quantity: item.quantity,
            price: item.unitPrice,
            image: (item.variant?.product as any)?.images?.[0],
          })),
          shippingAddress: order.shippingAddress,
          trackingToken: order.trackingToken,
          trackingUrl: `${process.env.FRONTEND_URL}/tracking/${order.trackingToken}`,
        },
      };

      await this.emailService.sendEmail(emailData);
      this.logger.log(`📧 Email guest inviata: ${email} - Ordine ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(`❌ Errore invio email guest:`, error);
      throw error;
    }
  }

  private async sendOrderConfirmedEmail(
    order: Order,
    user?: User
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);
      
      if (!email) {
        this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
        return false;
      }

      const customerName = user?.role === UserRole.CUSTOMER && user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : order.shippingAddress?.name || 'Cliente';

      // ✅ Calcola totali
      const subtotal = order.items.reduce((sum, item) => {
        return sum + (item.unitPrice * item.quantity);
      }, 0);

      // Usa shippingCost dell'ordine se disponibile, altrimenti calcola (soglia 50€, costo 5.90€)
      const shippingCost = order.shippingCost ?? (subtotal >= 50 ? 0 : 5.90);
      const discount = (order as { discount?: number }).discount ?? 0;

      this.logger.log(`📧 Sending confirmation email to: ${email} (Order: ${order.orderNumber}, User type: ${user?.role || 'unknown'})`);

      return await this.emailService.sendOrderConfirmed({
        email,
        customerName,
        orderNumber: order.orderNumber,
        total: order.total,
        items: order.items.map((item) => ({
          name: item.productName,
          brand: item.variant?.product?.name || undefined,
          quantity: item.quantity,
          price: item.unitPrice,
          image: (item.variant?.product as any)?.images?.[0] || (item.variant?.product as any)?.getMainImage,
        })),
        shippingAddress: {
          name: order.shippingAddress?.name || customerName,
          street: order.shippingAddress?.street || '',
          city: order.shippingAddress?.city || '',
          postalCode: order.shippingAddress?.postalCode || '',
          country: order.shippingAddress?.country || 'Italia',
          phone: order.shippingAddress?.phone || '',
        },
        estimatedDelivery: order.estimatedDelivery
          ? new Date(order.estimatedDelivery).toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
          : undefined,
        discount: discount,
        shippingCost: shippingCost,
        isVIP: order.total >= 100,
      });
    } catch (error) {
      this.logger.error('❌ Error sending order confirmed email:', error);
      return false;
    }
  }

  private async sendOrderShippedEmail(
    order: Order,
    user: User | undefined,
    trackingInfo: { trackingNumber: string; trackingUrl?: string }
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);
      
      if (!email) {
        this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
        return false;
      }

      const trackingUrl =
        trackingInfo.trackingUrl ||
        `https://vas.brt.it/vas/sped_det_show.hsm?referer=sped_numspe_par.htm&Nspediz=${trackingInfo.trackingNumber}`;

      return await this.emailService.sendOrderShipped({
        email,
        orderNumber: order.orderNumber,
        trackingNumber: trackingInfo.trackingNumber,
        trackingUrl,
        carrier: 'BRT',
        estimatedDelivery: order.estimatedDelivery
          ? new Date(order.estimatedDelivery).toLocaleDateString('it-IT')
          : undefined,
      });
    } catch (error) {
      this.logger.error('❌ Error sending order shipped email:', error);
      return false;
    }
  }

  private async sendPaymentFailedEmail(
    order: Order,
    user: User | undefined,
    reason: string
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);

      if (!email) {
        this.logger.warn(`No email for order ${order.orderNumber}`);
        return false;
      }

      return await this.emailService.sendPaymentFailed({
        email,
        orderNumber: order.orderNumber,
        reason,
      });
    } catch (error) {
      this.logger.error('Error sending payment failed email:', error);
      return false;
    }
  }

  private async sendOrderCancelledEmail(
    order: Order,
    reason?: string
  ): Promise<boolean> {
    try {
      const email = order.customerEmail || order.user?.email;

      if (!email) {
        this.logger.warn(`No email for cancelled order ${order.orderNumber}`);
        return false;
      }

      return await this.emailService.sendOrderCancelled({
        email,
        orderNumber: order.orderNumber,
        reason: reason || 'Ordine annullato su richiesta',
      });
    } catch (error) {
      this.logger.error('Error sending order cancelled email:', error);
      return false;
    }
  }

  /**
   * FIX #15: Invia email "Ordine Consegnato" con CTA per lasciare recensione
   */
  private async sendOrderDeliveredWithReviewCTA(
    order: Order,
    user?: User
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);

      if (!email) {
        this.logger.warn(`⚠️ No email for delivered order ${order.orderNumber}`);
        return false;
      }

      const customerName = user?.role === UserRole.CUSTOMER && user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : order.shippingAddress?.name || 'Cliente';

      // Build review URL - links to first product or general reviews page
      const firstVariantId = order.items?.[0]?.variantId;
      const reviewUrl = firstVariantId
        ? `${process.env.FRONTEND_URL}/account/reviews/new?orderId=${order.id}&productId=${firstVariantId}`
        : `${process.env.FRONTEND_URL}/account/reviews`;

      return await this.emailService.sendEmail(
        {
          to: email,
          subject: `Il tuo ordine ${order.orderNumber} è arrivato!`,
          template: 'order-delivered',
          context: {
            orderNumber: order.orderNumber,
            customerName,
            reviewUrl,
          },
        },
        'orders'
      );
    } catch (error) {
      this.logger.error('❌ Error sending order delivered email:', error);
      return false;
    }
  }

  async sendRefundProcessedEmail(
    order: Order,
    user: User | undefined,
    refundData: {
      refundAmount: number;
      isFullRefund: boolean;
      reason: string;
      estimatedArrival: string;
    }
  ): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user, order.customerEmail);
      
      if (!email) {
        this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
        return false;
      }

      const customerName = user?.role === UserRole.CUSTOMER && user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : order.shippingAddress?.name || 'Cliente';

      return await this.emailService.sendRefundProcessed({
        email,
        customerName,
        orderNumber: order.orderNumber,
        refundAmount: refundData.refundAmount,
        isFullRefund: refundData.isFullRefund,
        reason: refundData.reason,
        estimatedArrival: refundData.estimatedArrival,
        originalAmount: order.total,
      });
    } catch (error) {
      this.logger.error('❌ Error sending refund email:', error);
      return false;
    }
  }

  // ===========================
  // 🛒 CART RECOVERY
  // ===========================

  async sendCartRecoveryEmail(data: {
    email: string;
    orderNumber: string;
    trackingToken: string;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      image?: string;
    }>;
    total: number;
    expiresAt?: Date;
  }): Promise<boolean> {
    try {
      return await this.emailService.sendCartAbandoned(data);
    } catch (error) {
      this.logger.error('❌ Error sending cart recovery email:', error);
      return false;
    }
  }

  // ===========================
  // 👤 USER ACCOUNT EMAILS
  // ===========================

  async sendWelcomeEmail(user: User): Promise<boolean> {
    try {
      const email = this.resolveUserEmail(user);
      
      if (!email) {
        this.logger.warn(`⚠️ No email for welcome email: ${user.id}`);
        return false;
      }

      return await this.emailService.sendWelcome({
        email,
        firstName: user.firstName || '',
        welcomeCode: this.generateWelcomeCode(email),
      });
    } catch (error) {
      this.logger.error('❌ Error sending welcome email:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string
  ): Promise<boolean> {
    try {
      return await this.emailService.sendPasswordReset({
        email,
        resetToken,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
      });
    } catch (error) {
      this.logger.error('❌ Error sending password reset:', error);
      return false;
    }
  }

  // ===========================
  // 🛠️ HELPER METHODS
  // ===========================

  private calculateEstimatedDelivery(): string {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  private generateWelcomeCode(email: string): string {
    const hash = email.split('@')[0].toUpperCase();
    return `WELCOME${hash.slice(0, 4)}15`;
  }

  async sendReturnEmail(
    returnEntity: Return,
    type: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED'
  ): Promise<void> {
    try {
      const templateName = `return-${type.toLowerCase()}`;
      const customerName = returnEntity.user?.firstName || returnEntity.customerEmail.split('@')[0];
      const orderNumber = returnEntity.order?.orderNumber || returnEntity.orderId;

      // Context con nomi che matchano i placeholder nei template HTML
      const data = {
        // Placeholder principali usati nei template
        name: customerName,
        order_id: orderNumber,
        return_number: returnEntity.returnNumber,

        // Per return-rejected
        rejection_reason: returnEntity.rejectionReason || 'Motivo non specificato',

        // Per return-refunded
        refund_amount: returnEntity.refundAmount
          ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(returnEntity.refundAmount)
          : '0,00 €',

        // Per return-approved
        instructions: 'Prepara il pacco con cura e spediscilo entro 14 giorni all\'indirizzo:\n\nHaraldica Firenze Returns\nVia Roma 10\n20100 Milano (MI)\n\nUsa il corriere di tua scelta e conserva la ricevuta di spedizione.',
        tracking_number: returnEntity.returnTrackingNumber || '',

        // Extra info
        reason: RETURN_REASON_LABELS[returnEntity.reason] || returnEntity.reason,
        refund_date: returnEntity.refundedAt?.toLocaleDateString('it-IT') || '',
        tracking_url: `${process.env.FRONTEND_URL}/account/returns/${returnEntity.id}`,
        support_email: process.env.EMAIL_SUPPORT || 'supporto@haraldicafirenze.com',
      };

      await this.emailService.sendEmail(
        {
          to: returnEntity.customerEmail,
          subject: this.getReturnEmailSubject(type, returnEntity.returnNumber),
          template: templateName,
          context: data,
        },
        'orders'
      );

      this.logger.log(`Return email sent: ${type} - ${returnEntity.returnNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send return email ${type}:`, error);
    }
  }

  private getReturnEmailSubject(type: string, returnNumber: string): string {
    const subjects = {
      REQUESTED: `Richiesta Reso Ricevuta - ${returnNumber}`,
      APPROVED: `✓ Reso Approvato - ${returnNumber}`,
      REJECTED: `Reso Non Approvabile - ${returnNumber}`,
      REFUNDED: `💰 Rimborso Completato - ${returnNumber}`,
    };
    return subjects[type] || `Aggiornamento Reso - ${returnNumber}`;
  }
}