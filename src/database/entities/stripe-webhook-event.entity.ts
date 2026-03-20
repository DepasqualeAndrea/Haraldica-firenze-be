import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum WebhookEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('stripe_webhook_events')
@Index(['eventId'], { unique: true })
@Index(['type'])
@Index(['status'])
@Index(['createdAt'])
export class StripeWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  eventId: string;  // Stripe event ID (evt_xxx)

  @Column()
  type: string;  // payment_intent.succeeded, charge.refunded, etc.

  @Column({ type: 'enum', enum: WebhookEventStatus, default: WebhookEventStatus.PENDING })
  status: WebhookEventStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;  // Full Stripe event payload

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ default: 0 })
  retryCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;

  // Helper methods
  markAsProcessing(): void {
    this.status = WebhookEventStatus.PROCESSING;
  }

  markAsProcessed(): void {
    this.status = WebhookEventStatus.PROCESSED;
    this.processedAt = new Date();
  }

  markAsFailed(error: string): void {
    this.status = WebhookEventStatus.FAILED;
    this.errorMessage = error;
    this.retryCount += 1;
  }

  canRetry(): boolean {
    return this.status === WebhookEventStatus.FAILED && this.retryCount < 3;
  }

  isExpired(): boolean {
    // Eventi più vecchi di 30 giorni
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.createdAt < thirtyDaysAgo;
  }
}
