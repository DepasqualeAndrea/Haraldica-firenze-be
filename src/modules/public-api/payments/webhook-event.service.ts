import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  StripeWebhookEvent,
  WebhookEventStatus,
} from 'src/database/entities/stripe-webhook-event.entity';

@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(
    @InjectRepository(StripeWebhookEvent)
    private webhookEventRepository: Repository<StripeWebhookEvent>,
  ) {}

  /**
   * ✅ Verifica se evento già processato (persistent check)
   */
  async isEventDuplicated(eventId: string): Promise<boolean> {
    const existingEvent = await this.webhookEventRepository.findOne({
      where: { eventId },
    });

    return !!existingEvent;
  }

  /**
   * ✅ Crea nuovo evento webhook
   */
  async createEvent(eventId: string, type: string, payload: any): Promise<StripeWebhookEvent> {
    const event = this.webhookEventRepository.create({
      eventId,
      type,
      payload,
      status: WebhookEventStatus.PENDING,
    });

    return this.webhookEventRepository.save(event);
  }

  /**
   * ✅ Marca evento come in processing
   */
  async markAsProcessing(eventId: string): Promise<void> {
    await this.webhookEventRepository.update(
      { eventId },
      { status: WebhookEventStatus.PROCESSING },
    );
  }

  /**
   * ✅ Marca evento come processato
   */
  async markAsProcessed(eventId: string): Promise<void> {
    await this.webhookEventRepository.update(
      { eventId },
      {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    );
  }

  /**
   * ✅ Marca evento come fallito
   */
  async markAsFailed(eventId: string, errorMessage: string): Promise<void> {
    const event = await this.webhookEventRepository.findOne({
      where: { eventId },
    });

    if (event) {
      event.markAsFailed(errorMessage);
      await this.webhookEventRepository.save(event);
    }
  }

  /**
   * ✅ Get eventi falliti che possono essere ritentati
   */
  async getRetryableEvents(): Promise<StripeWebhookEvent[]> {
    const events = await this.webhookEventRepository.find({
      where: {
        status: WebhookEventStatus.FAILED,
      },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    return events.filter(event => event.canRetry());
  }

  /**
   * ✅ Get conteggio totale eventi processati
   */
  async getEventCount(): Promise<number> {
    return this.webhookEventRepository.count();
  }

  /**
   * 🧹 CRON: Cleanup eventi vecchi (>30 giorni)
   * Esegue ogni giorno alle 3:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldEvents(): Promise<void> {
    this.logger.log('🧹 [CRON] Cleanup vecchi webhook events - START');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.webhookEventRepository.delete({
      createdAt: LessThan(thirtyDaysAgo),
      status: WebhookEventStatus.PROCESSED,
    });

    const deletedCount = result.affected || 0;

    if (deletedCount > 0) {
      this.logger.log(`🧹 [CRON] Eliminati ${deletedCount} eventi webhook vecchi`);
    } else {
      this.logger.debug('🧹 [CRON] Nessun evento vecchio da eliminare');
    }
  }

  /**
   * Get statistiche eventi webhook
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    retryable: number;
  }> {
    const [total, pending, processing, processed, failed] = await Promise.all([
      this.webhookEventRepository.count(),
      this.webhookEventRepository.count({ where: { status: WebhookEventStatus.PENDING } }),
      this.webhookEventRepository.count({ where: { status: WebhookEventStatus.PROCESSING } }),
      this.webhookEventRepository.count({ where: { status: WebhookEventStatus.PROCESSED } }),
      this.webhookEventRepository.count({ where: { status: WebhookEventStatus.FAILED } }),
    ]);

    const retryableEvents = await this.getRetryableEvents();

    return {
      total,
      pending,
      processing,
      processed,
      failed,
      retryable: retryableEvents.length,
    };
  }
}
