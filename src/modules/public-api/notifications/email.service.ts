import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as juice from 'juice';

export interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  context?: Record<string, any>;
  from?: string;
}

type EmailProvider = 'resend' | 'ses' | 'smtp';
type EmailType = 'orders' | 'support' | 'info' | 'admin' | 'marketing';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);

  private resendClient: Resend | null = null;
  private sesClient: SESClient | null = null;
  private smtpTransporter: nodemailer.Transporter | null = null;

  private activeProvider: EmailProvider;
  private brandName: string;
  private emailAddresses: Record<EmailType, string>;
  private templatesCache = new Map<string, string>();
  private templatesDirectoryResolved: string | null = null;

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    this.initializeProvider();
    this.resolveTemplatesDirectory();
    this.loadTemplates();
  }

  // ===========================
  // INITIALIZATION
  // ===========================

  private initializeProvider() {
    this.activeProvider = this.configService.get<EmailProvider>('EMAIL_PROVIDER') || 'resend';
    this.brandName = this.configService.get('EMAIL_BRAND_NAME') || 'Haraldica Firenze';

    this.emailAddresses = {
      orders: this.configService.get('EMAIL_ORDERS') || 'ordini@haraldicafirenze.com',
      support: this.configService.get('EMAIL_SUPPORT') || 'supporto@haraldicafirenze.com',
      info: this.configService.get('EMAIL_INFO') || 'info@haraldicafirenze.com',
      admin: this.configService.get('EMAIL_ADMIN') || 'amministrazione@haraldicafirenze.com',
      marketing: this.configService.get('EMAIL_MARKETING') || 'marketing@haraldicafirenze.com',
    };

    this.logger.log(`📧 Email Service: ${this.activeProvider.toUpperCase()}`);
    this.logger.log(`📧 Orders: ${this.emailAddresses.orders}`);
    this.logger.log(`📧 Support: ${this.emailAddresses.support}`);
    this.logger.log(`📧 Info: ${this.emailAddresses.info}`);
    this.logger.log(`📧 Admin: ${this.emailAddresses.admin}`);
    this.logger.log(`📧 Marketing: ${this.emailAddresses.marketing}`);

    this.initializeResend();
    this.initializeSES();
    this.initializeSMTP();
  }

  private initializeResend() {
    try {
      const apiKey = this.configService.get<string>('RESEND_API_KEY');
      if (apiKey) {
        this.resendClient = new Resend(apiKey);
        this.logger.log('✅ Resend initialized');
      }
    } catch (error: any) {
      this.logger.error('❌ Resend failed:', error.message);
    }
  }

  private initializeSES() {
    try {
      const accessKeyId = this.configService.get<string>('AWS_SES_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>('AWS_SES_SECRET_ACCESS_KEY');
      const region = this.configService.get<string>('AWS_SES_REGION') || 'eu-central-1';

      const useIamRole = this.configService.get<string>('AWS_SES_USE_IAM_ROLE') === 'true';
      if (useIamRole || (accessKeyId && secretAccessKey)) {
        this.sesClient = new SESClient({
          region,
          ...(accessKeyId && secretAccessKey
            ? { credentials: { accessKeyId, secretAccessKey } }
            : {}),
        });
        this.logger.log(`✅ SES initialized (${region})`);
      } else {
        this.logger.warn('⚠️ SES not initialized: missing credentials');
      }
    } catch (error: any) {
      this.logger.error('❌ SES failed:', error.message);
    }
  }

  private initializeSMTP() {
    try {
      const host = this.configService.get<string>('SMTP_HOST');
      const port = this.configService.get<number>('SMTP_PORT');
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      if (host && user && pass) {
        this.smtpTransporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.logger.log('✅ SMTP initialized');
      }
    } catch (error: any) {
      this.logger.error('❌ SMTP failed:', error.message);
    }
  }

  // ===========================
  // TEMPLATE DIRECTORY RESOLUTION
  // ===========================

  private resolveTemplatesDirectory() {
    // 1. ENV override (priorità massima)
    const override = this.configService.get<string>('EMAIL_TEMPLATES_DIR');
    if (override) {
      const resolved = path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
      if (fs.existsSync(resolved)) {
        this.templatesDirectoryResolved = resolved;
        this.logger.log(`📂 Templates directory (env): ${this.templatesDirectoryResolved}`);
        return;
      } else {
        this.logger.warn(`⚠️ EMAIL_TEMPLATES_DIR set but not found: ${resolved}`);
      }
    }

    // 2. Path relativo a __dirname (funziona sia in dev che in dist se templates copiati)
    const dirnameCandidate = path.resolve(__dirname, 'templates');
    if (fs.existsSync(dirnameCandidate)) {
      this.templatesDirectoryResolved = dirnameCandidate;
      this.logger.log(`📂 Templates directory (__dirname): ${this.templatesDirectoryResolved}`);
      return;
    }

    // 3. Path source per development (process.cwd + src/modules/public-api/notifications/templates)
    const devCandidate = path.resolve(
      process.cwd(),
      'src',
      'modules',
      'public-api',
      'notifications',
      'templates'
    );
    if (fs.existsSync(devCandidate)) {
      this.templatesDirectoryResolved = devCandidate;
      this.logger.log(`📂 Templates directory (dev): ${this.templatesDirectoryResolved}`);
      return;
    }

    // 4. Fallback legacy path (se ancora usi 'notifications' senza 'public-api')
    const legacyCandidate = path.resolve(
      process.cwd(),
      'src',
      'modules',
      'notifications',
      'templates'
    );
    if (fs.existsSync(legacyCandidate)) {
      this.templatesDirectoryResolved = legacyCandidate;
      this.logger.log(`📂 Templates directory (legacy): ${this.templatesDirectoryResolved}`);
      return;
    }

    this.logger.error('❌ Templates directory not found (all strategies failed)');
    this.logger.error(`   Tried paths:`);
    this.logger.error(`   - ENV: ${override || '(not set)'}`);
    this.logger.error(`   - __dirname: ${dirnameCandidate}`);
    this.logger.error(`   - Dev: ${devCandidate}`);
    this.logger.error(`   - Legacy: ${legacyCandidate}`);
    this.templatesDirectoryResolved = null;
  }

  // ===========================
  // TEMPLATE MANAGEMENT
  // ===========================

  private loadTemplates() {
    if (!this.templatesDirectoryResolved) {
      this.logger.error('Cannot load templates: directory not resolved');
      return;
    }

    const templatesDir = this.templatesDirectoryResolved;

    try {
      // Carica tutti i file .html dalla root della cartella templates
      const files = fs.readdirSync(templatesDir);
      let totalLoaded = 0;

      files
        .filter((f) => f.endsWith('.html'))
        .forEach((filename) => {
          try {
            const templatePath = path.join(templatesDir, filename);
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            const templateName = filename.replace('.html', '');

            this.templatesCache.set(templateName, templateContent);
            totalLoaded++;
            this.logger.log(`Template loaded: ${templateName}`);
          } catch (error: any) {
            this.logger.warn(
              `Failed to load template ${filename}: ${error.message}`
            );
          }
        });

      this.logger.log(
        `Templates loaded: ${totalLoaded} templates cached`
      );
    } catch (error: any) {
      this.logger.error('Template loading failed:', error.message);
    }
  }

  /**
   * Sostituisce i placeholder {{variabile}} nel template con i valori dal context
   */
  private renderTemplate(template: string, context: Record<string, any>): string {
    let rendered = template;

    // Funzione ricorsiva per appiattire oggetti nested
    const flattenObject = (obj: Record<string, any>, prefix = ''): Record<string, string> => {
      const result: Record<string, string> = {};

      for (const key in obj) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}_${key}` : key;

        if (value === null || value === undefined) {
          result[newKey] = '';
        } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          Object.assign(result, flattenObject(value, newKey));
        } else if (value instanceof Date) {
          result[newKey] = value.toLocaleDateString('it-IT');
        } else if (typeof value === 'number') {
          // Formatta prezzi automaticamente se la chiave contiene price/total/amount/cost
          if (/price|total|amount|cost|subtotal/i.test(newKey)) {
            result[newKey] = new Intl.NumberFormat('it-IT', {
              style: 'currency',
              currency: 'EUR',
            }).format(value);
          } else {
            result[newKey] = String(value);
          }
        } else {
          result[newKey] = String(value);
        }
      }

      return result;
    };

    const flatContext = flattenObject(context);

    // Sostituisci tutti i placeholder {{key}}
    for (const [key, value] of Object.entries(flatContext)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      rendered = rendered.replace(regex, value);
    }

    // Gestisci array di items per ordini (genera HTML per ogni item)
    if (context.items && Array.isArray(context.items)) {
      const itemsHtml = context.items.map((item: any) => `
        <tr>
          <td style="font-family: 'Montserrat', sans-serif; font-size: 14px; color: #555555; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            ${item.name || item.productName || 'Prodotto'} x${item.quantity || 1}
          </td>
          <td align="right" style="font-family: 'Montserrat', sans-serif; font-size: 14px; color: #1a1a1a; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
            ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(item.price || item.unitPrice || 0)}
          </td>
        </tr>
      `).join('');

      rendered = rendered.replace(/\{\{\s*order_items\s*\}\}/gi, itemsHtml);
    }

    // Formatta indirizzo di spedizione
    if (context.shippingAddress) {
      const addr = context.shippingAddress;
      const addressHtml = [
        addr.name,
        addr.street || addr.streetName,
        `${addr.postalCode || ''} ${addr.city || ''}`.trim(),
        addr.country || 'Italia',
        addr.phone ? `Tel: ${addr.phone}` : ''
      ].filter(Boolean).join('<br>');

      rendered = rendered.replace(/\{\{\s*shipping_address\s*\}\}/gi, addressHtml);
    }

    // Rimuovi eventuali placeholder non sostituiti
    rendered = rendered.replace(/\{\{[^}]+\}\}/g, '');

    return rendered;
  }

  /**
   * Helper: Formatta prezzo in EUR
   */
  formatPrice(price: number): string {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(price);
  }

  /**
   * Helper: Formatta data in italiano
   */
  formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dateObj);
  }

  // ===========================
  // CORE SEND METHOD
  // ===========================

  private getEmailByType(type: EmailType): string {
    return this.emailAddresses[type];
  }

  listLoadedTemplates(): string[] {
    return Array.from(this.templatesCache.keys());
  }

  async sendEmail(
    options: EmailOptions,
    emailType: EmailType = 'info'
  ): Promise<boolean> {
    try {
      const template = this.templatesCache.get(options.template);
      if (!template) {
        const available = this.listLoadedTemplates().join(', ') || 'none';
        throw new Error(
          `Template "${options.template}" not found. Available: ${available}`
        );
      }

      const enrichedContext = {
        ...options.context,
        brand_name: this.brandName,
        brand_website: 'https://haraldicafirenze.com',
        year: new Date().getFullYear(),
      };

      // Usa renderTemplate per sostituire i placeholder
      const html = this.renderTemplate(template, enrichedContext);
      const fromEmail = options.from || this.getEmailByType(emailType);

      const inlinedHtml = juice(html, {
        preserveMediaQueries: true,
        removeStyleTags: false,
        webResources: {
          relativeTo: process.cwd(),
        },
      });

      const emailData = {
        from: `${this.brandName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: inlinedHtml,
      };

      await this.sendWithFailover(emailData);

      return true;
    } catch (error: any) {
      this.logger.error(`Send failed to ${options.to} after all retries:`, error.message);
      return false;
    }
  }

  /**
   * ✅ CRITICAL FIX: Cascading failover con exponential backoff retry
   * Prova: Resend → SES → SMTP
   * Ogni provider ha 3 tentativi con exponential backoff (1s, 2s, 4s)
   */
  private async sendWithFailover(
    data: { from: string; to: string; subject: string; html: string }
  ): Promise<void> {
    const providers: EmailProvider[] = ['resend', 'ses', 'smtp'];
    const maxRetries = 3;
    const baseDelay = 1000; // 1 secondo

    for (const provider of providers) {
      // Skip provider non inizializzato
      if (!this.isProviderInitialized(provider)) {
        this.logger.warn(`⚠️ Provider ${provider} non inizializzato, skip`);
        continue;
      }

      // Retry con exponential backoff per questo provider
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.logger.log(`📤 Tentativo ${attempt}/${maxRetries} via ${provider.toUpperCase()} → ${data.to}`);

          await this.sendViaProvider(provider, data);

          this.logger.log(`✅ Email inviata con successo via ${provider.toUpperCase()} al tentativo ${attempt}`);
          return; // Successo, esci
        } catch (error: any) {
          const isLastAttempt = attempt === maxRetries;
          const isLastProvider = provider === providers[providers.length - 1];

          this.logger.warn(
            `❌ Tentativo ${attempt}/${maxRetries} fallito via ${provider}: ${error.message}`
          );

          if (isLastAttempt) {
            if (isLastProvider) {
              // Ultimo tentativo dell'ultimo provider, lancia errore
              throw new Error(
                `Tutti i provider email hanno fallito. Ultimo errore (${provider}): ${error.message}`
              );
            } else {
              // Passa al prossimo provider
              this.logger.warn(`⏭️ Passo al prossimo provider email...`);
              break;
            }
          }

          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          this.logger.log(`⏳ Retry tra ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
  }

  private isProviderInitialized(provider: EmailProvider): boolean {
    switch (provider) {
      case 'resend':
        return this.resendClient !== null;
      case 'ses':
        return this.sesClient !== null;
      case 'smtp':
        return this.smtpTransporter !== null;
      default:
        return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendViaProvider(
    provider: EmailProvider,
    data: { from: string; to: string; subject: string; html: string }
  ): Promise<void> {
    switch (provider) {
      case 'resend':
        return this.sendViaResend(data);
      case 'ses':
        return this.sendViaSES(data);
      case 'smtp':
        return this.sendViaSMTP(data);
    }
  }

  private async sendViaResend(data: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.resendClient) throw new Error('Resend not initialized');

    const result = await this.resendClient.emails.send({
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html,
    });

    if ((result as any).error) throw new Error((result as any).error.message);

    this.logger.log(`✅ Sent via Resend: ${data.to} - ID: ${(result as any).data?.id}`);
  }

  private async sendViaSES(data: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.sesClient) throw new Error('SES not initialized');

    const command = new SendEmailCommand({
      Source: data.from,
      Destination: { ToAddresses: [data.to] },
      Message: {
        Subject: { Data: data.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: data.html, Charset: 'UTF-8' } },
      },
    });

    const result = await this.sesClient.send(command);
    this.logger.log(`✅ Sent via SES: ${data.to} - ID: ${result.MessageId}`);
  }

  private async sendViaSMTP(data: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.smtpTransporter) throw new Error('SMTP not initialized');

    const result = await this.smtpTransporter.sendMail({
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html,
    });

    this.logger.log(`✅ Sent via SMTP: ${data.to} - ID: ${result.messageId}`);
  }

  // ===========================
  // 📦 ORDER EMAILS
  // ===========================

  async sendOrderCreated(data: {
    email: string;
    orderNumber: string;
    total: number;
    items: any[];
    shippingAddress: any;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Ordine Ricevuto ${data.orderNumber} - ${this.brandName}`,
        template: 'order-created',
        context: data,
      },
      'orders'
    );
  }

  // src/modules/public-api/notifications/email.service.ts

  async sendOrderConfirmed(data: {
    email: string;
    customerName: string;
    orderNumber: string;
    total: number;
    items: any[];
    shippingAddress: any;
    estimatedDelivery?: string;
    discount?: number;
    shippingCost?: number;
    isVIP?: boolean;
  }): Promise<boolean> {
    // ✅ Calcola subtotal (somma di tutti gli item)
    const subtotal = data.items.reduce((sum, item) => {
      return sum + (item.price || item.unitPrice || 0) * (item.quantity || 1);
    }, 0);

    // ✅ Shipping cost (default 5.90€, gratuito se subtotal >= 50€)
    const shippingCost = data.shippingCost !== undefined
      ? data.shippingCost
      : (subtotal >= 50 ? 0 : 5.90);

    // ✅ Formatta items per template
    const formattedItems = data.items.map(item => ({
      name: item.name || item.productName || 'Prodotto',
      brand: item.brand || undefined,
      image: item.image || item.product?.images?.[0] || 'https://via.placeholder.com/80',
      quantity: item.quantity || 1,
      unitPrice: item.price || item.unitPrice || 0,
    }));

    // ✅ Calcola orderTotal
    const orderTotal = data.total || (subtotal + shippingCost - (data.discount || 0));

    // ✅ Estimated delivery (se non fornito, calcola 3-5 giorni lavorativi)
    const estimatedDelivery = data.estimatedDelivery || this.calculateEstimatedDelivery();

    return this.sendEmail(
      {
        to: data.email,
        subject: `Ordine Confermato #${data.orderNumber} - ${this.brandName}`,
        template: 'order-confirmed',
        context: {
          // Dati principali
          customerName: data.customerName,
          orderNumber: data.orderNumber,
          orderTotal: orderTotal,
          subtotal: subtotal,
          discount: data.discount || 0,
          shippingCost: shippingCost,
          estimatedDelivery: estimatedDelivery,
          orderDate: new Date().toLocaleDateString('it-IT'),
          // Items per {{order_items}}
          items: formattedItems,
          // Indirizzo per {{shipping_address}}
          shippingAddress: {
            name: data.shippingAddress?.name || data.customerName,
            street: data.shippingAddress?.street || data.shippingAddress?.streetName || '',
            city: data.shippingAddress?.city || '',
            postalCode: data.shippingAddress?.postalCode || '',
            country: data.shippingAddress?.country || 'Italia',
            phone: data.shippingAddress?.phone || '',
          },
        },
      },
      'orders'
    );
  }

  /**
   * ✅ Helper: Calcola estimated delivery (3-5 giorni lavorativi)
   */
  private calculateEstimatedDelivery(): string {
    const deliveryDate = new Date();

    // Aggiungi 3 giorni lavorativi (salta weekend)
    let daysToAdd = 3;
    while (daysToAdd > 0) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);

      // Salta sabato (6) e domenica (0)
      if (deliveryDate.getDay() !== 0 && deliveryDate.getDay() !== 6) {
        daysToAdd--;
      }
    }

    // Formatta: "lunedì 25 novembre"
    return deliveryDate.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  async sendOrderProcessing(data: {
    email: string;
    orderNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `📦 Ordine in Preparazione - ${data.orderNumber}`,
        template: 'order-processing',
        context: data,
      },
      'orders'
    );
  }

  async sendOrderReadyToShip(data: {
    email: string;
    orderNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `📋 Ordine Pronto per Spedizione - ${data.orderNumber}`,
        template: 'order-ready-to-ship',
        context: data,
      },
      'orders'
    );
  }

  async sendOrderShipped(data: {
    email: string;
    customerName?: string;
    orderNumber: string;
    trackingNumber: string;
    trackingUrl: string;
    carrier: string;
    estimatedDelivery?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Il tuo ordine ${data.orderNumber} e in viaggio!`,
        template: 'order-shipped',
        context: {
          orderNumber: data.orderNumber,
          trackingNumber: data.trackingNumber,
          trackingUrl: data.trackingUrl,
          carrier: data.carrier,
          estimatedDelivery: data.estimatedDelivery || '',
        },
      },
      'orders'
    );
  }

  async sendOrderInTransit(data: {
    email: string;
    orderNumber: string;
    trackingNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `📍 Ordine ${data.orderNumber} in Transito`,
        template: 'order-in-transit',
        context: data,
      },
      'orders'
    );
  }

  async sendOrderOutForDelivery(data: {
    email: string;
    orderNumber: string;
    trackingNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🚛 Il tuo ordine ${data.orderNumber} arriva oggi!`,
        template: 'order-out-for-delivery',
        context: data,
      },
      'orders'
    );
  }

  async sendOrderDelivered(data: {
    email: string;
    orderNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🎉 Ordine ${data.orderNumber} Consegnato!`,
        template: 'order-delivered',
        context: data,
      },
      'orders'
    );
  }

  async sendOrderCancelled(data: {
    email: string;
    orderNumber: string;
    reason?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `❌ Ordine ${data.orderNumber} Cancellato`,
        template: 'order-cancelled',
        context: data,
      },
      'orders'
    );
  }

  async sendCartAbandoned(data: {
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
    const resumeUrl = `${process.env.FRONTEND_URL}/checkout/resume/${data.trackingToken}`;

    return this.sendEmail(
      {
        to: data.email,
        subject: `🛒 Hai dimenticato qualcosa - Ordine ${data.orderNumber}`,
        template: 'cart-abandoned',
        context: {
          ...data,
          resumeUrl,
          expiryText: data.expiresAt
            ? `I prodotti sono riservati fino a ${data.expiresAt.toLocaleString('it-IT')}`
            : '',
        },
      },
      'orders'
    );
  }

  // ===========================
  // 💳 PAYMENT EMAILS
  // ===========================

  async sendPaymentSuccessful(data: {
    email: string;
    orderNumber: string;
    amount: number;
    paymentMethod: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `✅ Pagamento Confermato - ${data.orderNumber}`,
        template: 'payment-successful',
        context: data,
      },
      'orders'
    );
  }

  async sendPaymentFailed(data: {
    email: string;
    orderNumber: string;
    reason: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `❌ Pagamento Non Riuscito - ${data.orderNumber}`,
        template: 'payment-failed',
        context: data,
      },
      'orders'
    );
  }

  async sendPaymentPending(data: {
    email: string;
    orderNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `⏳ Pagamento in Attesa - ${data.orderNumber}`,
        template: 'payment-pending',
        context: data,
      },
      'orders'
    );
  }

  async sendRefundProcessed(data: {
    email: string;
    customerName: string;
    orderNumber: string;
    refundAmount: number;
    isFullRefund: boolean;
    reason: string;
    estimatedArrival: string;
    originalAmount: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: data.isFullRefund
          ? `💰 Rimborso Confermato - ${data.orderNumber}`
          : `💰 Rimborso Parziale - ${data.orderNumber}`,
        template: 'refund-processed',
        context: {
          ...data,
          refundPercentage: Math.round((data.refundAmount / data.originalAmount) * 100),
        },
      },
      'orders'
    );
  }

  // ===========================
  // 👤 USER ACCOUNT EMAILS
  // ===========================

  async sendWelcome(data: {
    email: string;
    firstName: string;
    welcomeCode?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Benvenuta nel mondo ${this.brandName}!`,
        template: 'welcome-email',
        context: {
          firstName: data.firstName,
          email: data.email,
          welcomeCode: data.welcomeCode || '',
          dashboardLink: `${process.env.FRONTEND_URL}/account`,
        },
      },
      'info'
    );
  }

  async sendEmailVerification(data: {
    email: string;
    verificationToken: string;
    verificationUrl: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Verifica il tuo indirizzo email - ${this.brandName}`,
        template: 'email-verification',
        context: {
          email: data.email,
          verificationToken: data.verificationToken,
          verificationUrl: data.verificationUrl,
        },
      },
      'support'
    );
  }

  async sendPasswordReset(data: {
    email: string;
    resetToken: string;
    resetUrl: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Reset Password - ${this.brandName}`,
        template: 'password-reset',
        context: {
          email: data.email,
          resetToken: data.resetToken,
          resetUrl: data.resetUrl,
        },
      },
      'support'
    );
  }

  async sendPasswordChanged(data: { email: string }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Password Modificata - ${this.brandName}`,
        template: 'password-changed',
        context: {
          email: data.email,
        },
      },
      'support'
    );
  }

  async sendAccountDeleted(data: {
    email: string;
    reason?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Account Eliminato - ${this.brandName}`,
        template: 'account-deleted',
        context: {
          email: data.email,
          reason: data.reason || 'Su tua richiesta',
        },
      },
      'support'
    );
  }

  // ===========================
  // ⚙️ ADMIN EMAILS
  // ===========================

  async sendLowStockAlert(alertData: {
    products: Array<{
      id: string;
      name: string;
      sku: string;
      currentStock: number;
      minStockThreshold: number;
      category?: string;
      price?: number;
      image?: string;
    }>;
    totalProductsLow: number;
  }): Promise<boolean> {
    const adminEmail = this.getEmailByType('admin');

    return this.sendEmail(
      {
        to: adminEmail,
        subject: `⚠️ ALERT: ${alertData.totalProductsLow} prodotti sotto soglia`,
        template: 'low-stock-alert',
        context: {
          ...alertData,
          alertDate: new Date(),
          urgentProducts: alertData.products.filter((p) => p.currentStock === 0),
          warningProducts: alertData.products.filter(
            (p) => p.currentStock > 0 && p.currentStock <= p.minStockThreshold
          ),
        },
      },
      'admin'
    );
  }

  async sendNewOrderAdmin(data: {
    orderNumber: string;
    customerEmail: string;
    total: number;
    items: any[];
  }): Promise<boolean> {
    const adminEmail = this.getEmailByType('admin');

    return this.sendEmail(
      {
        to: adminEmail,
        subject: `🛒 Nuovo Ordine: ${data.orderNumber}`,
        template: 'new-order-admin',
        context: data,
      },
      'admin'
    );
  }

  async sendFailedPaymentAdmin(data: {
    orderNumber: string;
    customerEmail: string;
    amount: number;
    reason: string;
  }): Promise<boolean> {
    const adminEmail = this.getEmailByType('admin');

    return this.sendEmail(
      {
        to: adminEmail,
        subject: `❌ Pagamento Fallito: ${data.orderNumber}`,
        template: 'failed-payment-admin',
        context: data,
      },
      'admin'
    );
  }

  async sendDailyReport(data: {
    date: Date;
    totalOrders: number;
    totalRevenue: number;
    topProducts: any[];
    stats: any;
  }): Promise<boolean> {
    const adminEmail = this.getEmailByType('admin');

    return this.sendEmail(
      {
        to: adminEmail,
        subject: `📊 Report Giornaliero - ${data.date.toLocaleDateString('it-IT')}`,
        template: 'daily-report',
        context: data,
      },
      'admin'
    );
  }

  // ===========================
  // 📢 MARKETING EMAILS
  // ===========================

  async sendNewsletter(data: {
    email: string;
    firstName?: string;
    content: string;
    ctaText?: string;
    ctaUrl?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Newsletter ${this.brandName} - Novità e Offerte`,
        template: 'newsletter',
        context: data,
      },
      'marketing'
    );
  }

  async sendNewProductLaunch(data: {
    email: string;
    productName: string;
    productDescription: string;
    productImage: string;
    productUrl: string;
    price: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🆕 Nuovo Prodotto: ${data.productName}`,
        template: 'new-product-launch',
        context: data,
      },
      'marketing'
    );
  }

  async sendBackInStock(data: {
    email: string;
    productName: string;
    productImage: string;
    productUrl: string;
    price: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🔔 ${data.productName} è tornato disponibile!`,
        template: 'back-in-stock',
        context: data,
      },
      'marketing'
    );
  }

  async sendPriceDrop(data: {
    email: string;
    productName: string;
    oldPrice: number;
    newPrice: number;
    discountPercentage: number;
    productImage: string;
    productUrl: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `💸 Prezzo Ridotto: ${data.productName}`,
        template: 'price-drop',
        context: data,
      },
      'marketing'
    );
  }

  async sendPersonalizedRecommendations(data: {
    email: string;
    firstName?: string;
    products: Array<{
      name: string;
      image: string;
      price: number;
      url: string;
    }>;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `✨ Prodotti Selezionati per Te`,
        template: 'personalized-recommendations',
        context: data,
      },
      'marketing'
    );
  }

  // ===========================
  // 🎁 PROMOTIONAL EMAILS
  // ===========================

  async sendDiscountCode(data: {
    email: string;
    firstName?: string;
    discountCode: string;
    discountPercentage: number;
    expiresAt: Date;
    minPurchase?: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🎁 Codice Sconto Esclusivo: ${data.discountPercentage}% OFF`,
        template: 'discount-code',
        context: data,
      },
      'marketing'
    );
  }

  async sendBirthdayOffer(data: {
    email: string;
    firstName: string;
    birthdayCode: string;
    discountPercentage: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `🎂 Buon Compleanno da ${this.brandName}!`,
        template: 'birthday-offer',
        context: data,
      },
      'marketing'
    );
  }

  async sendVipExclusive(data: {
    email: string;
    firstName: string;
    offerTitle: string;
    offerDescription: string;
    ctaText: string;
    ctaUrl: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `👑 Offerta VIP Esclusiva - ${this.brandName}`,
        template: 'vip-exclusive',
        context: data,
      },
      'marketing'
    );
  }

  // ===========================
  // 📦 RETURNS EMAILS
  // ===========================

  async sendReturnRequested(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
    reason: string;
    items: Array<{
      productName: string;
      quantity: number;
      refundAmount: number;
    }>;
    totalRefundAmount: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Richiesta Reso Ricevuta - ${data.returnNumber}`,
        template: 'return-requested',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
          reason: data.reason,
          items: data.items,
          refund_amount: data.totalRefundAmount,
        },
      },
      'orders'
    );
  }

  async sendReturnApproved(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
    instructions: string;
    returnTrackingNumber?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Reso Approvato - ${data.returnNumber}`,
        template: 'return-approved',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
          instructions: data.instructions || 'Spedisci il pacco all\'indirizzo indicato entro 14 giorni. Usa il numero di tracking fornito per monitorare la spedizione.',
          tracking_number: data.returnTrackingNumber,
        },
      },
      'orders'
    );
  }

  async sendReturnRejected(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
    rejectionReason: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Aggiornamento Reso - ${data.returnNumber}`,
        template: 'return-rejected',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
          rejection_reason: data.rejectionReason,
        },
      },
      'orders'
    );
  }

  async sendReturnReceived(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Reso Ricevuto - ${data.returnNumber}`,
        template: 'return-received',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
        },
      },
      'orders'
    );
  }

  async sendReturnRefunded(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
    refundAmount: number;
    paymentMethod?: string;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Rimborso Completato - ${data.returnNumber}`,
        template: 'return-refunded',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
          refund_amount: data.refundAmount,
          payment_method: data.paymentMethod || 'Metodo di pagamento originale',
        },
      },
      'orders'
    );
  }

  async sendReturnPartial(data: {
    email: string;
    customerName: string;
    returnNumber: string;
    orderNumber: string;
    approvedItems: Array<{
      productName: string;
      quantity: number;
      refundAmount: number;
    }>;
    rejectedItems: Array<{
      productName: string;
      quantity: number;
      reason: string;
    }>;
    totalRefundAmount: number;
  }): Promise<boolean> {
    return this.sendEmail(
      {
        to: data.email,
        subject: `Reso Parzialmente Approvato - ${data.returnNumber}`,
        template: 'return-partial',
        context: {
          name: data.customerName,
          order_id: data.orderNumber,
          return_number: data.returnNumber,
          approved_items: data.approvedItems,
          rejected_items: data.rejectedItems,
          refund_amount: data.totalRefundAmount,
        },
      },
      'orders'
    );
  }

  // ===========================
  // 🛠️ UTILITY METHODS
  // ===========================

  async sendTestEmail(to: string): Promise<boolean> {
    try {
      await this.sendViaProvider(this.activeProvider, {
        from: `${this.brandName} <${this.getEmailByType('info')}>`,
        to,
        subject: `Test Email - ${this.brandName}`,
        html: `
          <h1>Test Email</h1>
          <p>Provider: ${this.activeProvider}</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
          <p>Templates loaded: ${this.listLoadedTemplates().length}</p>
          <p>Available templates: ${this.listLoadedTemplates().join(', ')}</p>
        `,
      });
      return true;
    } catch (error: any) {
      this.logger.error('❌ Test email failed:', error.message);
      return false;
    }
  }
}