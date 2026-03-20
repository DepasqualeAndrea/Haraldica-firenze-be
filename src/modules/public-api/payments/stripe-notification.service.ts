import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Order } from "src/database/entities/order.entity";
import { User } from "src/database/entities/user.entity";
import { Repository } from "typeorm";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class StripeNotificationsService {
  private readonly logger = new Logger(StripeNotificationsService.name);

  constructor(
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private eventEmitter: EventEmitter2,
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // ============= PAYMENT EVENTS =============
    this.eventEmitter.on('payment.succeeded', this.handlePaymentSucceeded.bind(this));
    this.eventEmitter.on('payment.failed', this.handlePaymentFailed.bind(this));
    this.eventEmitter.on('payment.requires_action', this.handlePaymentRequiresAction.bind(this));
    this.eventEmitter.on('payment.processing', this.handlePaymentProcessing.bind(this));

    // ============= CHECKOUT EVENTS =============
    this.eventEmitter.on('checkout.session_created', this.handleCheckoutSessionCreated.bind(this));
    this.eventEmitter.on('order.confirmed', this.handleOrderConfirmed.bind(this));

    // ============= REFUND EVENTS =============
    this.eventEmitter.on('refund.created', this.handleRefundCreated.bind(this));
    this.eventEmitter.on('refund.processed', this.handleRefundProcessed.bind(this));
    this.eventEmitter.on('refund.failed', this.handleRefundFailed.bind(this));

    // ============= DISPUTE EVENTS =============
    this.eventEmitter.on('dispute.created', this.handleDisputeCreated.bind(this));
    this.eventEmitter.on('dispute.closed', this.handleDisputeClosed.bind(this));

    // ============= SUBSCRIPTION EVENTS =============
    this.eventEmitter.on('subscription.created', this.handleSubscriptionCreated.bind(this));
    this.eventEmitter.on('subscription.cancelled', this.handleSubscriptionCancelled.bind(this));
    this.eventEmitter.on('subscription.trial_ending', this.handleSubscriptionTrialEnding.bind(this));

    // ============= CUSTOMER EVENTS =============
    this.eventEmitter.on('customer.created', this.handleCustomerCreated.bind(this));
    this.eventEmitter.on('payment_method.saved', this.handlePaymentMethodSaved.bind(this));
    this.eventEmitter.on('payment_method.removed', this.handlePaymentMethodRemoved.bind(this));

    // ============= FRAUD & SECURITY EVENTS =============
    this.eventEmitter.on('fraud.warning_created', this.handleFraudWarning.bind(this));
    this.eventEmitter.on('review.opened', this.handleReviewOpened.bind(this));

    this.logger.log('✅ Event listeners per notifiche Stripe configurati');
  }

  // ============= PAYMENT NOTIFICATION HANDLERS =============

  private async handlePaymentSucceeded(data: {
    payment: any;
    order: any;
    user: any;
    paymentIntent?: any;
  }): Promise<void> {
    try {
      const { payment, order, user } = data;

      // Email di conferma pagamento
      await this.sendPaymentConfirmationEmail(user, order, payment);

      // Notifica interna per team
      await this.sendInternalPaymentNotification(order, payment, 'succeeded');

      // Analytics event
      this.eventEmitter.emit('analytics.payment_succeeded', {
        userId: user.id,
        orderId: order.id,
        amount: payment.amount,
        paymentMethod: payment.method,
        processingTime: data.paymentIntent?.created ? 
          Date.now() - (data.paymentIntent.created * 1000) : null,
      });

      this.logger.log(`✅ Notifiche inviate per pagamento riuscito: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione notifiche payment succeeded:', error);
    }
  }

  private async handlePaymentFailed(data: {
    order: any;
    user: any;
    reason: string;
    failureCode?: string;
    failureMessage?: string;
  }): Promise<void> {
    try {
      const { order, user, reason, failureCode } = data;

      // Email di pagamento fallito con suggerimenti
      await this.sendPaymentFailedEmail(user, order, {
        reason,
        failureCode,
        suggestedActions: this.getPaymentFailureSuggestions(failureCode),
        retryUrl: `${process.env.FRONTEND_URL}/checkout/retry/${order.id}`,
      });

      // Notifica interna ad alta priorità
      await this.sendInternalAlert('payment_failed', {
        orderId: order.id,
        userId: user.id,
        amount: order.total,
        reason,
        failureCode,
        priority: 'high',
      });

      // Evento per retry automatico se appropriato
      if (this.shouldRetryPayment(failureCode)) {
        this.eventEmitter.emit('payment.schedule_retry', {
          orderId: order.id,
          retryDelay: this.getRetryDelay(failureCode),
        });
      }

      this.logger.log(`❌ Notifiche inviate per pagamento fallito: ${order.orderNumber} - ${reason}`);

    } catch (error) {
      this.logger.error('Errore gestione notifiche payment failed:', error);
    }
  }

  private async handlePaymentRequiresAction(data: {
    payment: any;
    order: any;
    user: any;
    nextAction: any;
  }): Promise<void> {
    try {
      const { payment, order, user, nextAction } = data;

      // Email con istruzioni per completare pagamento (3D Secure, etc.)
      await this.sendPaymentActionRequiredEmail(user, order, {
        actionType: nextAction?.type || 'unknown',
        instructions: this.getActionInstructions(nextAction?.type),
        completionUrl: nextAction?.redirect_to_url?.url || 
          `${process.env.FRONTEND_URL}/checkout/complete/${order.id}`,
        expiresAt: this.calculateActionExpiry(),
      });

      // SMS se numero disponibile e azione urgente
      if (user.phone && this.isUrgentAction(nextAction?.type)) {
        await this.sendPaymentActionSMS(user.phone, order.orderNumber, nextAction);
      }

      this.logger.log(`⚠️ Notifiche inviate per azione richiesta: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione notifiche payment requires action:', error);
    }
  }

  private async handlePaymentProcessing(data: {
    payment: any;
    order: any;
    user: any;
  }): Promise<void> {
    try {
      const { order, user } = data;

      // Email di pagamento in elaborazione
      await this.sendPaymentProcessingEmail(user, order, {
        estimatedCompletion: this.calculateProcessingTime(data.payment.method),
        statusUrl: `${process.env.FRONTEND_URL}/orders/${order.id}`,
      });

      this.logger.log(`🔄 Notifiche inviate per pagamento in elaborazione: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione notifiche payment processing:', error);
    }
  }

  // ============= CHECKOUT & ORDER NOTIFICATION HANDLERS =============

  private async handleCheckoutSessionCreated(data: {
    order: any;
    user: any;
    session: any;
    payment: any;
  }): Promise<void> {
    try {
      const { order, user, session } = data;

      // Email di checkout iniziato (per abandoned cart follow-up)
      this.scheduleAbandonedCheckoutReminder(order.id, user.id, session.id);

      // Analytics tracking
      this.eventEmitter.emit('analytics.checkout_started', {
        userId: user.id,
        orderId: order.id,
        sessionId: session.id,
        amount: order.total,
        itemCount: order.items?.length || 0,
      });

      this.logger.log(`🛒 Checkout iniziato per: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione checkout session created:', error);
    }
  }

  private async handleOrderConfirmed(data: {
    order: any;
    user: any;
    paymentDetails?: any;
  }): Promise<void> {
    try {
      const { order, user, paymentDetails } = data;

      // Email di conferma ordine completa
      await this.sendOrderConfirmationEmail(user, order, {
        paymentDetails,
        estimatedDelivery: this.calculateDeliveryDate(order),
        trackingAvailable: false, // Sarà aggiornato quando spedito
        orderSummary: this.buildOrderSummary(order),
        nextSteps: this.getOrderNextSteps(order),
      });

      // Notifica team fulfillment
      await this.sendFulfillmentNotification(order);

      // SMS conferma se numero disponibile
      if (user.phone) {
        await this.sendOrderConfirmationSMS(user.phone, order);
      }

      // Programma follow-up emails
      this.scheduleOrderFollowUpEmails(order.id, user.id);

      this.logger.log(`✅ Notifiche conferma ordine inviate: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione order confirmed:', error);
    }
  }

  // ============= REFUND NOTIFICATION HANDLERS =============

  private async handleRefundCreated(data: {
    payment: any;
    order: any;
    user: any;
    refund: any;
    refundAmount: number;
    isFullRefund: boolean;
  }): Promise<void> {
    try {
      const { order, user, refund, refundAmount, isFullRefund } = data;

      // Email di rimborso
      await this.sendRefundNotificationEmail(user, order, {
        refundAmount,
        isFullRefund,
        refundId: refund.id,
        reason: refund.reason,
        estimatedArrival: this.calculateRefundArrival(refund),
        refundMethod: this.getRefundMethod(refund),
      });

      // Notifica contabilità
      await this.sendAccountingRefundNotification(order, refund, refundAmount);

      this.logger.log(`💰 Notifiche rimborso inviate: ${order.orderNumber} - €${refundAmount}`);

    } catch (error) {
      this.logger.error('Errore gestione refund created:', error);
    }
  }

  private async handleRefundProcessed(data: {
    payment: any;
    order: any;
    user: any;
    refund: any;
    refundAmount: number;
    isFullRefund: boolean;
    stockRestored: boolean;
    reason: string;
  }): Promise<void> {
    try {
      const { order, user, refund, refundAmount, isFullRefund, stockRestored } = data;

      // Email di rimborso processato
      await this.sendRefundProcessedEmail(user, order, {
        refundAmount,
        isFullRefund,
        refundId: refund.id,
        stockRestored,
        processingTime: this.calculateRefundProcessingTime(refund),
      });

      this.logger.log(`✅ Notifiche rimborso processato: ${order.orderNumber}`);

    } catch (error) {
      this.logger.error('Errore gestione refund processed:', error);
    }
  }

  private async handleRefundFailed(data: {
    refund: any;
    failureReason?: string;
  }): Promise<void> {
    try {
      const { refund, failureReason } = data;

      // Notifica interna critica
      await this.sendInternalAlert('refund_failed', {
        refundId: refund.id,
        amount: refund.amount / 100,
        failureReason,
        priority: 'critical',
        requiresAction: true,
      });

      this.logger.error(`❌ Rimborso fallito: ${refund.id} - ${failureReason}`);

    } catch (error) {
      this.logger.error('Errore gestione refund failed:', error);
    }
  }

  // ============= DISPUTE NOTIFICATION HANDLERS =============

  private async handleDisputeCreated(data: {
    payment: any;
    order: any;
    user: any;
    dispute: any;
    amount: number;
    reason: string;
  }): Promise<void> {
    try {
      const { order, user, dispute, amount, reason } = data;

      // Email al cliente sulla contestazione
      await this.sendDisputeNotificationEmail(user, order, {
        disputeId: dispute.id,
        amount,
        reason,
        dueDate: new Date(dispute.evidence_due_by * 1000),
        supportEmail: process.env.SUPPORT_EMAIL || 'support@haraldicafirenze.com',
      });

      // Alert critico per team legale/supporto
      await this.sendInternalAlert('dispute_created', {
        disputeId: dispute.id,
        orderId: order.id,
        userId: user.id,
        amount,
        reason,
        dueDate: new Date(dispute.evidence_due_by * 1000),
        priority: 'critical',
        requiresAction: true,
        assignedTeam: 'legal',
      });

      this.logger.warn(`⚠️ Contestazione creata: ${dispute.id} - €${amount} - ${reason}`);

    } catch (error) {
      this.logger.error('Errore gestione dispute created:', error);
    }
  }

  private async handleDisputeClosed(data: {
    dispute: any;
    outcome: string;
    amount: number;
  }): Promise<void> {
    try {
      const { dispute, outcome, amount } = data;

      // Notifica interna risultato contestazione
      await this.sendInternalAlert('dispute_closed', {
        disputeId: dispute.id,
        outcome,
        amount,
        priority: outcome === 'won' ? 'low' : 'medium',
        requiresAction: outcome === 'lost',
      });

      this.logger.log(`✅ Contestazione chiusa: ${dispute.id} - Outcome: ${outcome}`);

    } catch (error) {
      this.logger.error('Errore gestione dispute closed:', error);
    }
  }

  // ============= SUBSCRIPTION NOTIFICATION HANDLERS =============

  private async handleSubscriptionCreated(data: {
    subscription: any;
    user: any;
    plan: any;
  }): Promise<void> {
    try {
      const { subscription, user, plan } = data;

      // Email di benvenuto subscription
      await this.sendSubscriptionWelcomeEmail(user, subscription, plan);

      // Programma email di onboarding
      this.scheduleSubscriptionOnboarding(subscription.id, user.id);

      this.logger.log(`🔄 Subscription creato: ${subscription.id} per ${user.email}`);

    } catch (error) {
      this.logger.error('Errore gestione subscription created:', error);
    }
  }

  private async handleSubscriptionCancelled(data: {
    subscription: any;
    user: any;
    reason?: string;
  }): Promise<void> {
    try {
      const { subscription, user, reason } = data;

      // Email di cancellazione con feedback
      await this.sendSubscriptionCancelledEmail(user, subscription, {
        reason,
        feedbackUrl: `${process.env.FRONTEND_URL}/feedback/subscription`,
        reactivationOffer: this.generateReactivationOffer(subscription),
      });

      // Analytics evento
      this.eventEmitter.emit('analytics.subscription_cancelled', {
        subscriptionId: subscription.id,
        userId: user.id,
        reason,
        lifetimeValue: this.calculateSubscriptionValue(subscription),
      });

      this.logger.log(`🚫 Subscription cancellato: ${subscription.id}`);

    } catch (error) {
      this.logger.error('Errore gestione subscription cancelled:', error);
    }
  }

  private async handleSubscriptionTrialEnding(data: {
    subscription: any;
    user: any;
    daysLeft: number;
  }): Promise<void> {
    try {
      const { subscription, user, daysLeft } = data;

      // Email reminder trial scadenza
      await this.sendTrialEndingEmail(user, subscription, {
        daysLeft,
        upgradeUrl: `${process.env.FRONTEND_URL}/subscription/upgrade`,
        specialOffer: this.generateTrialConversionOffer(subscription),
      });

      this.logger.log(`⏰ Trial in scadenza: ${subscription.id} - ${daysLeft} giorni`);

    } catch (error) {
      this.logger.error('Errore gestione trial ending:', error);
    }
  }

  // ============= CUSTOMER & PAYMENT METHOD HANDLERS =============

  private async handleCustomerCreated(data: {
    customer: any;
    user: any;
  }): Promise<void> {
    try {
      const { user } = data;

      // Email di benvenuto con setup account
      await this.sendCustomerWelcomeEmail(user, {
        accountSetupUrl: `${process.env.FRONTEND_URL}/account/setup`,
        firstOrderDiscount: this.generateWelcomeOffer(user),
      });

      this.logger.log(`👤 Cliente Stripe creato per: ${user.email}`);

    } catch (error) {
      this.logger.error('Errore gestione customer created:', error);
    }
  }

  private async handlePaymentMethodSaved(data: {
    user: any;
    paymentMethod: any;
    isDefault: boolean;
  }): Promise<void> {
    try {
      const { user, paymentMethod, isDefault } = data;

      // Email di conferma metodo salvato
      await this.sendPaymentMethodSavedEmail(user, {
        paymentMethodType: paymentMethod.type,
        last4: paymentMethod.card?.last4,
        isDefault,
        securityNote: true,
      });

      this.logger.log(`💳 Metodo pagamento salvato per: ${user.email}`);

    } catch (error) {
      this.logger.error('Errore gestione payment method saved:', error);
    }
  }

  private async handlePaymentMethodRemoved(data: {
    user: any;
    paymentMethodId: string;
  }): Promise<void> {
    try {
      const { user } = data;

      // Email di conferma rimozione
      await this.sendPaymentMethodRemovedEmail(user, {
        securityNote: true,
        addNewMethodUrl: `${process.env.FRONTEND_URL}/account/payment-methods`,
      });

      this.logger.log(`🗑️ Metodo pagamento rimosso per: ${user.email}`);

    } catch (error) {
      this.logger.error('Errore gestione payment method removed:', error);
    }
  }

  // ============= FRAUD & SECURITY HANDLERS =============

  private async handleFraudWarning(data: {
    warning: any;
    fraudType: string;
    chargeId?: string;
  }): Promise<void> {
    try {
      const { warning, fraudType, chargeId } = data;

      // Alert critico per team sicurezza
      await this.sendInternalAlert('fraud_warning', {
        warningId: warning.id,
        fraudType,
        chargeId,
        priority: 'critical',
        requiresAction: true,
        assignedTeam: 'security',
        autoActions: this.getFraudAutoActions(fraudType),
      });

      this.logger.warn(`🚨 Fraud warning: ${warning.id} - Type: ${fraudType}`);

    } catch (error) {
      this.logger.error('Errore gestione fraud warning:', error);
    }
  }

  private async handleReviewOpened(data: {
    review: any;
    reason: string;
    chargeId?: string;
  }): Promise<void> {
    try {
      const { review, reason, chargeId } = data;

      // Notifica team compliance
      await this.sendInternalAlert('review_opened', {
        reviewId: review.id,
        reason,
        chargeId,
        priority: 'high',
        requiresAction: true,
        assignedTeam: 'compliance',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 giorni
      });

      this.logger.warn(`👁️ Review aperta: ${review.id} - Reason: ${reason}`);

    } catch (error) {
      this.logger.error('Errore gestione review opened:', error);
    }
  }

  // ============= EMAIL SENDING METHODS =============

  private async sendPaymentConfirmationEmail(user: any, order: any, payment: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `✅ Pagamento confermato - Ordine ${order.orderNumber}`,
      template: 'payment-confirmation',
      context: {
        user,
        order,
        payment,
        paymentMethod: this.formatPaymentMethod(payment),
        transactionId: payment.stripePaymentIntentId || payment.stripeChargeId,
        processingTime: this.formatProcessingTime(payment.createdAt),
      },
    });
  }

  private async sendPaymentFailedEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `❌ Problema con il pagamento - Ordine ${order.orderNumber}`,
      template: 'payment-failed',
      context: {
        user,
        order,
        ...details,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@haraldicafirenze.com',
        supportPhone: process.env.SUPPORT_PHONE || '+39 02 1234567',
      },
    });
  }

  private async sendPaymentActionRequiredEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `⚠️ Azione richiesta per completare il pagamento - Ordine ${order.orderNumber}`,
      template: 'payment-action-required',
      context: {
        user,
        order,
        ...details,
        urgentAction: this.isUrgentAction(details.actionType),
      },
    });
  }

  private async sendPaymentProcessingEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `🔄 Pagamento in elaborazione - Ordine ${order.orderNumber}`,
      template: 'payment-processing',
      context: {
        user,
        order,
        ...details,
      },
    });
  }

  private async sendRefundNotificationEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `💰 Rimborso ${details.isFullRefund ? 'completo' : 'parziale'} - Ordine ${order.orderNumber}`,
      template: 'refund-notification',
      context: {
        user,
        order,
        ...details,
      },
    });
  }

  // ============= INTERNAL NOTIFICATION METHODS =============

  private async sendInternalPaymentNotification(order: any, payment: any, status: string): Promise<void> {
    // TODO: Implementare notifiche interne (Slack, Teams, email admin, etc.)
    this.logger.log(`📊 Internal notification: Payment ${status} for order ${order.orderNumber}`);
  }

  private async sendInternalAlert(type: string, data: any): Promise<void> {
    // TODO: Implementare sistema di alert interni
    this.logger.warn(`🚨 Internal alert: ${type}`, data);
  }

  private async sendFulfillmentNotification(order: any): Promise<void> {
    // TODO: Implementare notifica team fulfillment
    this.logger.log(`📦 Fulfillment notification for order: ${order.orderNumber}`);
  }

  private async sendAccountingRefundNotification(order: any, refund: any, amount: number): Promise<void> {
    // TODO: Implementare notifica contabilità
    this.logger.log(`💰 Accounting notification: Refund €${amount} for order ${order.orderNumber}`);
  }

  // ============= SMS METHODS =============

  private async sendPaymentActionSMS(phone: string, orderNumber: string, nextAction: any): Promise<void> {
    // TODO: Implementare invio SMS
    this.logger.log(`📱 SMS sent to ${phone} for order ${orderNumber} - Action: ${nextAction?.type}`);
  }

  private async sendOrderConfirmationSMS(phone: string, order: any): Promise<void> {
    // TODO: Implementare SMS conferma
    this.logger.log(`📱 Order confirmation SMS sent to ${phone} for order ${order.orderNumber}`);
  }

  // ============= SCHEDULING METHODS =============

  private scheduleAbandonedCheckoutReminder(orderId: string, userId: string, sessionId: string): void {
    // TODO: Implementare promemoria carrello abbandonato
    this.logger.log(`⏰ Scheduled abandoned checkout reminder for order ${orderId}`);
  }

  private scheduleOrderFollowUpEmails(orderId: string, userId: string): void {
    // TODO: Implementare follow-up emails
    this.logger.log(`📅 Scheduled follow-up emails for order ${orderId}`);
  }

  private scheduleSubscriptionOnboarding(subscriptionId: string, userId: string): void {
    // TODO: Implementare onboarding subscription
    this.logger.log(`📚 Scheduled subscription onboarding for ${subscriptionId}`);
  }

  // ============= UTILITY METHODS =============

  private getPaymentFailureSuggestions(failureCode?: string): string[] {
    const suggestions: { [key: string]: string[] } = {
      'card_declined': [
        'Verifica che i dati della carta siano corretti',
        'Controlla il saldo disponibile',
        'Contatta la tua banca per autorizzare il pagamento',
        'Prova con un metodo di pagamento diverso'
      ],
      'insufficient_funds': [
        'Verifica il saldo disponibile',
        'Prova con una carta diversa',
        'Contatta la tua banca'
      ],
      'expired_card': [
        'Aggiorna i dati della carta',
        'Usa una carta non scaduta'
      ],
      'incorrect_cvc': [
        'Verifica il codice CVC sul retro della carta',
        'Riprova inserendo il codice corretto'
      ],
    };

    return suggestions[failureCode || ''] || [
      'Verifica i dati di pagamento',
      'Prova con un metodo diverso',
      'Contatta il supporto se il problema persiste'
    ];
  }

  private shouldRetryPayment(failureCode?: string): boolean {
    const retryableCodes = ['processing_error', 'issuer_not_available', 'try_again_later'];
    return retryableCodes.includes(failureCode || '');
  }

  private getRetryDelay(failureCode?: string): number {
    // Delay in minuti
    const delays: { [key: string]: number } = {
      'processing_error': 5,
      'issuer_not_available': 15,
      'try_again_later': 30,
    };
    return delays[failureCode || ''] || 10;
  }

  private getActionInstructions(actionType?: string): string {
    const instructions: { [key: string]: string } = {
      'use_stripe_sdk': 'Completa la verifica 3D Secure nel browser',
      'redirect_to_url': 'Verrai reindirizzato per completare il pagamento',
      'verify_with_microdeposits': 'Verifica i microdepositi sul tuo conto',
    };
    return instructions[actionType || ''] || 'Segui le istruzioni per completare il pagamento';
  }

  private calculateActionExpiry(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ore
  }

  private isUrgentAction(actionType?: string): boolean {
    return ['use_stripe_sdk', 'redirect_to_url'].includes(actionType || '');
  }

  private calculateProcessingTime(paymentMethod?: string): string {
    const times: { [key: string]: string } = {
      'card': '1-2 minuti',
      'sepa_debit': '2-3 giorni lavorativi',
      'bank_transfer': '1-3 giorni lavorativi',
    };
    return times[paymentMethod || ''] || '1-5 minuti';
  }

  private calculateDeliveryDate(order: any): string {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3); // 3 giorni standard
    return deliveryDate.toLocaleDateString('it-IT');
  }

  private buildOrderSummary(order: any): any {
    return {
      itemCount: order.items?.length || 0,
      subtotal: order.subtotal,
      shipping: order.shippingCost,
      tax: order.taxAmount,
      discount: order.discountAmount,
      total: order.total,
    };
  }

  private getOrderNextSteps(order: any): string[] {
    return [
      'Riceverai una email quando il tuo ordine sarà spedito',
      'Puoi seguire lo stato del tuo ordine nel tuo account',
      'La consegna è prevista entro 3-5 giorni lavorativi',
    ];
  }

  private calculateRefundArrival(refund: any): string {
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + 5); // 5-7 giorni
    return arrivalDate.toLocaleDateString('it-IT');
  }

  private getRefundMethod(refund: any): string {
    return 'Stesso metodo di pagamento utilizzato per l\'ordine';
  }

  private calculateRefundProcessingTime(refund: any): string {
    const created = new Date(refund.created * 1000);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minuti`;
    } else if (diffMinutes < 1440) {
      return `${Math.floor(diffMinutes / 60)} ore`;
    } else {
      return `${Math.floor(diffMinutes / 1440)} giorni`;
    }
  }

  private generateWelcomeOffer(user: any): any {
    return {
      code: `WELCOME${user.id.slice(-6).toUpperCase()}`,
      discount: 15,
      expiresIn: '30 giorni',
    };
  }

  private generateReactivationOffer(subscription: any): any {
    return {
      discount: 50,
      validFor: '7 giorni',
      specialTerms: 'Prima fattura scontata del 50%',
    };
  }

  private generateTrialConversionOffer(subscription: any): any {
    return {
      discount: 25,
      validFor: '48 ore',
      bonusMonths: 1,
    };
  }

  private calculateSubscriptionValue(subscription: any): number {
    // TODO: Calcolare valore lifetime subscription
    return 0;
  }

  private getFraudAutoActions(fraudType: string): string[] {
    const actions: { [key: string]: string[] } = {
      'high_risk': ['Blocca automaticamente', 'Richiedi verifica identità'],
      'suspicious_activity': ['Richiedi conferma email', 'Limita funzionalità'],
    };
    return actions[fraudType] || ['Monitora attentamente'];
  }

  private formatPaymentMethod(payment: any): string {
    if (payment.method === 'card' && payment.stripePaymentMethodDetails?.card) {
      const card = payment.stripePaymentMethodDetails.card;
      return `${card.brand?.toUpperCase()} **** ${card.last4}`;
    }
    return payment.method || 'N/A';
  }

  private formatProcessingTime(createdAt: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) {
      return `${diffSeconds} secondi`;
    } else if (diffSeconds < 3600) {
      return `${Math.floor(diffSeconds / 60)} minuti`;
    } else {
      return `${Math.floor(diffSeconds / 3600)} ore`;
    }
  }

  // ============= TEMPLATE SPECIFIC EMAIL METHODS =============

  private async sendOrderConfirmationEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `🎉 Ordine confermato ${order.orderNumber} - Grazie per il tuo acquisto!`,
      template: 'order-confirmation-complete',
      context: {
        user,
        order,
        ...details,
        brandInfo: {
          name: 'Haraldica Firenze',
          supportEmail: process.env.SUPPORT_EMAIL || 'support@haraldicafirenze.com',
          trackingUrl: `${process.env.FRONTEND_URL}/orders/${order.id}/tracking`,
        },
      },
    });
  }

  private async sendRefundProcessedEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `✅ Rimborso processato - Ordine ${order.orderNumber}`,
      template: 'refund-processed',
      context: {
        user,
        order,
        ...details,
      },
    });
  }

  private async sendDisputeNotificationEmail(user: any, order: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `⚠️ Informazioni richieste per ordine ${order.orderNumber}`,
      template: 'dispute-notification',
      context: {
        user,
        order,
        ...details,
      },
    });
  }

  private async sendSubscriptionWelcomeEmail(user: any, subscription: any, plan: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `🎉 Benvenuto nel tuo abbonamento ${plan.name}!`,
      template: 'subscription-welcome',
      context: {
        user,
        subscription,
        plan,
        managementUrl: `${process.env.FRONTEND_URL}/account/subscription`,
      },
    });
  }

  private async sendSubscriptionCancelledEmail(user: any, subscription: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `😢 Abbonamento cancellato - Ci mancherai!`,
      template: 'subscription-cancelled',
      context: {
        user,
        subscription,
        ...details,
      },
    });
  }

  private async sendTrialEndingEmail(user: any, subscription: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `⏰ Il tuo trial scade tra ${details.daysLeft} giorni`,
      template: 'trial-ending',
      context: {
        user,
        subscription,
        ...details,
      },
    });
  }

  private async sendCustomerWelcomeEmail(user: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `👋 Benvenuto in Haraldica Firenze - Il tuo account è pronto!`,
      template: 'customer-welcome',
      context: {
        user,
        ...details,
      },
    });
  }

  private async sendPaymentMethodSavedEmail(user: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `💳 Nuovo metodo di pagamento salvato`,
      template: 'payment-method-saved',
      context: {
        user,
        ...details,
      },
    });
  }

  private async sendPaymentMethodRemovedEmail(user: any, details: any): Promise<boolean> {
    return this.emailService.sendEmail({
      to: user.email,
      subject: `🗑️ Metodo di pagamento rimosso`,
      template: 'payment-method-removed',
      context: {
        user,
        ...details,
      },
    });
  }
}