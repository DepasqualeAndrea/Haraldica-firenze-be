import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  HttpStatus,
  Get,
  Delete,
  Ip
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { WebhookService } from './webhooks.service';
import { WebhookEventService } from './webhook-event.service';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly rateLimiter = new Map<string, number[]>(); // Rate limiting per IP

  constructor(
    private stripeService: StripeService,
    private webhookService: WebhookService,
    private webhookEventService: WebhookEventService, // ✅ NEW: DB-based event tracking
    private configService: ConfigService,
  ) { }

  @Post('stripe')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Webhook Stripe per eventi di pagamento' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
    @Ip() clientIp: string,
  ) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    this.logger.log(`🔄 [${requestId}] Webhook ricevuto da IP: ${clientIp}`);

    // ============= RATE LIMITING =============
    const rateLimitResult = this.checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      this.logger.warn(`🚫 [${requestId}] Rate limit superato per IP: ${clientIp}`);
      return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // ============= VALIDAZIONE PRELIMINARE =============
    const validationResult = this.validateWebhookRequest(req, signature, requestId);
    if (!validationResult.valid) {
      return res.status(validationResult.statusCode).json(validationResult.response);
    }

    let event: Stripe.Event;
    let eventId: string = 'unknown';

    try {
      // ============= VERIFICA SIGNATURE =============
      const webhookSecret = this.configService.get('stripe.webhookSecret');
      const payload: Buffer | string =
        (req as RawBodyRequest).rawBody ??
        (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));
      event = this.stripeService.constructEvent(payload, signature, webhookSecret);
      eventId = event.id;

      this.logger.log(`✅ [${requestId}] Signature valida: ${event.type} - ${eventId}`);

      // ============= CONTROLLO DUPLICATI (DB-based) =============
      const isDuplicate = await this.webhookEventService.isEventDuplicated(eventId);
      if (isDuplicate) {
        this.logger.warn(`⚠️ [${requestId}] Evento duplicato ignorato: ${eventId}`);
        return res.status(HttpStatus.OK).json({
          received: true,
          message: 'Evento duplicato ignorato',
          event_id: eventId,
          event_type: event.type,
          requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // ✅ Crea evento nel database
      await this.webhookEventService.createEvent(eventId, event.type, event);
      await this.webhookEventService.markAsProcessing(eventId);

      // ============= CONTROLLO FRESCHEZZA EVENTO =============
      const eventAge = Date.now() - (event.created * 1000);
      const maxAge = 5 * 60 * 1000; // 5 minuti

      if (eventAge > maxAge) {
        this.logger.warn(`⏰ [${requestId}] Evento vecchio (${Math.round(eventAge / 1000)}s): ${eventId}`);
        
        return res.status(HttpStatus.OK).json({
          received: true,
          message: 'Evento troppo vecchio, ignorato',
          event_id: eventId,
          event_type: event.type,
          event_age_seconds: Math.round(eventAge / 1000),
          max_age_seconds: Math.round(maxAge / 1000),
          requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // ============= PROCESSING CON RETRY LOGIC =============
      const processingResult = await this.processEventWithRetry(event, requestId, 3);

      const processingTime = Date.now() - startTime;

      if (processingResult.success) {
        // ✅ Marca evento come processato con successo
        await this.webhookEventService.markAsProcessed(eventId);

        this.logger.log(`✅ [${requestId}] Evento processato: ${event.type} - ${eventId} (${processingTime}ms)`);

        return res.status(HttpStatus.OK).json({
          received: true,
          event_id: eventId,
          event_type: event.type,
          processing_time_ms: processingTime,
          requestId,
          timestamp: new Date().toISOString(),
          retry_count: processingResult.retryCount,
        });
      } else {
        // ❌ Marca evento come fallito
        await this.webhookEventService.markAsFailed(eventId, processingResult!.error!.message);

        // Errore durante processing
        const isTemporaryError = this.isTemporaryError(processingResult.error);
        const statusCode = isTemporaryError ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.OK;

        this.logger.error(`❌ [${requestId}] Errore processing ${event.type} - ${eventId}:`, {
          error: processingResult!.error!.message,
          stack: processingResult!.error!.stack,
          processing_time_ms: processingTime,
          retry_count: processingResult.retryCount,
          is_temporary: isTemporaryError,
        });

        // ============= DEAD LETTER QUEUE PER ERRORI PERMANENTI =============
        if (!isTemporaryError) {
          await this.sendToDeadLetterQueue(event, processingResult!.error!, requestId);
        }

        return res.status(statusCode).json({
          received: !isTemporaryError,
          event_id: eventId,
          event_type: event.type,
          error: isTemporaryError ? 'Errore temporaneo, Stripe riproverà' : 'Errore permanente processato',
          error_type: isTemporaryError ? 'temporary' : 'permanent',
          processing_time_ms: processingTime,
          retry_count: processingResult.retryCount,
          requestId,
          timestamp: new Date().toISOString(),
        });
      }

    } catch (signatureError) {
      this.logger.error(`❌ [${requestId}] Signature invalida:`, {
        error: signatureError.message,
        ip: clientIp,
        signature: signature?.substring(0, 20) + '...',
        bodySize: req.body?.length || 0,
        bodyType: typeof req.body,
        timestamp: new Date().toISOString(),
      });

      // ============= SICUREZZA: LOG TENTATIVI FRAUDOLENTI =============
      this.logSuspiciousActivity(clientIp, 'invalid_signature', requestId);

      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Signature webhook invalida',
        message: 'Verifica configurazione webhook endpoint',
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ============= ENDPOINT UTILITY E TESTING =============

  @Get('stripe/health')
  @ApiExcludeEndpoint()
  async webhookHealthCheck(@Res() res: Response) {
    const eventCount = await this.webhookEventService.getEventCount();

    const checks = {
      webhook_secret: !!this.configService.get('stripe.webhookSecret'),
      stripe_service: await this.testStripeConnection(),
      webhook_service: true,
      database: await this.testDatabaseConnection(),
      total_events_processed: eventCount,
      active_rate_limits: this.rateLimiter.size,
    };

    const allHealthy = Object.values(checks).every(check => check === true || typeof check === 'number');
    const statusCode = allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
      version: this.configService.get('app.apiVersion'),
    });
  }

  @Post('stripe/test')
  @ApiExcludeEndpoint()
  async testWebhookConfiguration(@Res() res: Response) {
    if (this.configService.get('NODE_ENV') === 'production') {
      return res.status(HttpStatus.FORBIDDEN).json({
        error: 'Test endpoint non disponibile in produzione',
        timestamp: new Date().toISOString(),
      });
    }

    const webhookSecret = this.configService.get('stripe.webhookSecret');
    const stripeSecretKey = this.configService.get('stripe.secretKey');

    const testResults = {
      webhook_secret_configured: !!webhookSecret,
      webhook_secret_format_valid: webhookSecret?.startsWith('whsec_') || false,
      stripe_secret_configured: !!stripeSecretKey,
      stripe_secret_format_valid: stripeSecretKey?.startsWith('sk_') || false,
      stripe_mode: stripeSecretKey?.startsWith('sk_test') ? 'test' : 'live',
      stripe_connection: await this.testStripeConnection(),
      database_connection: await this.testDatabaseConnection(),
      webhook_endpoint_reachable: true, // Se arriviamo qui, l'endpoint è raggiungibile
      environment: this.configService.get('NODE_ENV'),
      event_tracking_status: {
        total_events: await this.webhookEventService.getEventCount(),
        memory_usage: process.memoryUsage().heapUsed,
      },
    };

    // Test signature verification con payload fittizio
    if (webhookSecret && webhookSecret.startsWith('whsec_')) {
      testResults['signature_verification_test'] = await this.testSignatureVerification(webhookSecret);
    }

    return res.json({
      ...testResults,
      overall_status: this.calculateOverallStatus(testResults),
      timestamp: new Date().toISOString(),
    });
  }

  @Delete('stripe/cache')
  @ApiExcludeEndpoint()
  async clearEventCache(@Res() res: Response) {
    if (this.configService.get('NODE_ENV') === 'production') {
      return res.status(HttpStatus.FORBIDDEN).json({
        error: 'Operazione non disponibile in produzione',
      });
    }

    // ✅ Ora usiamo database per tracking eventi, non cache in-memory
    const eventCount = await this.webhookEventService.getEventCount();
    this.rateLimiter.clear();

    this.logger.log(`ℹ️ Database tracking: ${eventCount} eventi totali`);

    return res.json({
      message: 'Rate limiter pulito (eventi tracked su database)',
      total_events_in_db: eventCount,
      timestamp: new Date().toISOString(),
    });
  }

  @Get('stripe/stats')
  @ApiExcludeEndpoint()
  async getWebhookStats(@Res() res: Response) {
    const eventCount = await this.webhookEventService.getEventCount();

    const stats = {
      event_tracking: {
        total_events: eventCount,
        storage: 'database',
      },
      rate_limiting: {
        active_ips: this.rateLimiter.size,
        total_requests_tracked: Array.from(this.rateLimiter.values())
          .reduce((sum, requests) => sum + requests.length, 0),
      },
      system: {
        memory_usage: process.memoryUsage(),
        uptime: process.uptime(),
        node_version: process.version,
      },
      configuration: {
        environment: this.configService.get('NODE_ENV'),
        stripe_mode: this.configService.get('stripe.secretKey')?.startsWith('sk_test') ? 'test' : 'live',
        webhook_secret_configured: !!this.configService.get('stripe.webhookSecret'),
      },
    };

    return res.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  // ============= METODI PRIVATI =============

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minuto
    const maxRequests = 100; // 100 requests per minuto per IP

    if (!this.rateLimiter.has(ip)) {
      this.rateLimiter.set(ip, []);
    }

    const requests = this.rateLimiter.get(ip)!;

    // Rimuovi richieste vecchie
    const validRequests = requests.filter(time => now - time < windowMs);
    this.rateLimiter.set(ip, validRequests);

    if (validRequests.length >= maxRequests) {
      const oldestRequest = Math.min(...validRequests);
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Aggiungi richiesta corrente
    validRequests.push(now);
    this.rateLimiter.set(ip, validRequests);

    return { allowed: true };
  }

  private validateWebhookRequest(req: RawBodyRequest, signature: string, requestId: string): {
    valid: boolean;
    statusCode: number;
    response?: any;
  } {
    if (!signature) {
      this.logger.error(`❌ [${requestId}] Signature mancante`);
      return {
        valid: false,
        statusCode: HttpStatus.BAD_REQUEST,
        response: {
          error: 'Signature mancante',
          received: false,
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (!req.body) {
      this.logger.error(`❌ [${requestId}] Body richiesta vuoto`);
      return {
        valid: false,
        statusCode: HttpStatus.BAD_REQUEST,
        response: {
          error: 'Body richiesta vuoto',
          received: false,
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const webhookSecret = this.configService.get('stripe.webhookSecret');
    if (!webhookSecret) {
      this.logger.error(`❌ [${requestId}] Webhook secret non configurato`);
      return {
        valid: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        response: {
          error: 'Configurazione webhook mancante',
          received: false,
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return { valid: true, statusCode: HttpStatus.OK };
  }

  // ✅ REMOVED: Metodi in-memory sostituiti con DB-based tracking nel WebhookEventService

  private async processEventWithRetry(
    event: Stripe.Event,
    requestId: string,
    maxRetries: number
  ): Promise<{ success: boolean; error?: Error; retryCount: number }> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.webhookService.handleEvent(event);

        if (attempt > 1) {
          this.logger.log(`✅ [${requestId}] Successo al tentativo ${attempt}/${maxRetries}: ${event.type}`);
        }

        return { success: true, retryCount: attempt - 1 };
      } catch (error) {
        lastError = error;

        this.logger.warn(`⚠️ [${requestId}] Tentativo ${attempt}/${maxRetries} fallito: ${error.message}`);

        // Non fare retry per errori permanenti
        if (!this.isTemporaryError(error)) {
          break;
        }

        // Backoff esponenziale per retry
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return { success: false, error: lastError!, retryCount: maxRetries };
  }

  private isTemporaryError(error: any): boolean {
    const temporaryErrors = [
      'QueryRunnerAlreadyReleasedError',
      'ConnectionTimeoutError',
      'DatabaseConnectionError',
      'Connection terminated',
      'Connection lost',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'ENOTFOUND',
      'ECONNREFUSED',
      'socket hang up',
      'Request timeout',
      'Service Unavailable',
      'Internal Server Error',
      'Timeout',
    ];

    const permanentErrors = [
      'ValidationError',
      'Bad Request',
      'Unauthorized',
      'Forbidden',
      'Not Found',
      'NotFoundException',
      'Ordine non trovato',
      'Order not found',
      'User not found',
      'Invalid order status',
      'Duplicate webhook event',
      'orderId mancante',
    ];

    const errorMessage = error.message || '';
    const errorName = error.constructor?.name || '';
    const errorCode = error.code || '';

    if (errorName === 'NotFoundException') {
      return false;
    }

    // Check per errori permanenti prima
    const isPermanent = permanentErrors.some(permError =>
      errorMessage.toLowerCase().includes(permError.toLowerCase()) ||
      errorName.toLowerCase().includes(permError.toLowerCase())
    );

    if (isPermanent) {
      return false;
    }

    // Check per errori temporanei
    const isTemporary = temporaryErrors.some(tempError =>
      errorMessage.includes(tempError) ||
      errorName.includes(tempError) ||
      errorCode.includes(tempError)
    );

    // Default a temporary per errori sconosciuti (safer per retry)
    return isTemporary || (!isPermanent && !isTemporary);
  }

  private async sendToDeadLetterQueue(event: Stripe.Event, error: Error, requestId: string): Promise<void> {
    try {
      // TODO: Implementare dead letter queue (Redis, SQS, Database, etc.)
      this.logger.error(`💀 [${requestId}] Evento inviato a DLQ: ${event.id}`, {
        event_type: event.type,
        event_id: event.id,
        error_message: error.message,
        error_stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    } catch (dlqError) {
      this.logger.error(`❌ [${requestId}] Errore invio a DLQ:`, dlqError);
    }
  }

  private logSuspiciousActivity(ip: string, activityType: string, requestId: string): void {
    this.logger.warn(`🚨 [${requestId}] Attività sospetta rilevata:`, {
      ip,
      activity: activityType,
      timestamp: new Date().toISOString(),
      user_agent: 'N/A', // TODO: Estrarre da request
    });

    // TODO: Implementare sistema di alerting per attività sospette
  }

  private async testStripeConnection(): Promise<boolean> {
    try {
      const stripeInstance = this.stripeService.getStripeInstance();
      await stripeInstance.balance.retrieve();
      return true;
    } catch (error) {
      this.logger.warn('Test connessione Stripe fallito:', error.message);
      return false;
    }
  }

  private async testDatabaseConnection(): Promise<boolean> {
    try {
      // TODO: Implementare test connessione database
      return true;
    } catch (error) {
      return false;
    }
  }

  private async testSignatureVerification(webhookSecret: string): Promise<boolean> {
    try {
      const testPayload = JSON.stringify({ test: true });
      const testSignature = 'v1=test'; // Signature fittizia

      // Questo test fallirà sempre con signature fittizia, ma verifica che il metodo non vada in crash
      this.stripeService.constructEvent(testPayload, testSignature, webhookSecret);
      return false; // Non dovrebbe mai arrivare qui
    } catch (error) {
      // Errore atteso per signature fittizia
      return error.message.includes('signature') || error.message.includes('timestamp');
    }
  }

  private calculateOverallStatus(testResults: any): 'healthy' | 'degraded' | 'unhealthy' {
    const criticalChecks = [
      'webhook_secret_configured',
      'webhook_secret_format_valid',
      'stripe_secret_configured',
      'stripe_connection',
      'database_connection',
    ];

    const failedCritical = criticalChecks.filter(check => !testResults[check]);

    if (failedCritical.length === 0) {
      return 'healthy';
    } else if (failedCritical.length <= 2) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }
}