// src/database/entities/newsletter.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum NewsletterStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

export interface NewsletterTargetAudience {
  allSubscribers?: boolean;
  vipOnly?: boolean;
  minOrders?: number;
  minSpent?: number;
  registeredAfter?: Date;
  registeredBefore?: Date;
  hasReviews?: boolean;
}

export interface NewsletterDiscountCode {
  code: string;
  discountPercent?: number;
  discountAmount?: number;
  validFrom?: Date;
  validUntil?: Date;
  minPurchase?: number;
}

@Entity('newsletters')
@Index(['status'])
@Index(['scheduledAt'])
@Index(['createdAt'])
export class Newsletter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subject: string;

  @Column('text')
  content: string;

  @Column('text', { nullable: true })
  previewText?: string;

  @Column({
    type: 'enum',
    enum: NewsletterStatus,
    default: NewsletterStatus.DRAFT,
  })
  status: NewsletterStatus;

  // CTA Button
  @Column({ nullable: true })
  ctaText?: string;

  @Column({ nullable: true })
  ctaUrl?: string;

  // Visual
  @Column({ nullable: true })
  headerImage?: string;

  // Scheduling
  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  // Stats
  @Column({ default: 0 })
  recipientCount: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ default: 0 })
  openCount: number;

  @Column({ default: 0 })
  clickCount: number;

  // Targeting
  @Column('jsonb', { nullable: true })
  targetAudience?: NewsletterTargetAudience;

  // Discount code association
  @Column('jsonb', { nullable: true })
  discountCode?: NewsletterDiscountCode;

  // Tracking
  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  campaignName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ===========================
  // HELPER METHODS
  // ===========================

  get isDraft(): boolean {
    return this.status === NewsletterStatus.DRAFT;
  }

  get isScheduled(): boolean {
    return this.status === NewsletterStatus.SCHEDULED;
  }

  get isSent(): boolean {
    return this.status === NewsletterStatus.SENT;
  }

  get canEdit(): boolean {
    return this.status === NewsletterStatus.DRAFT || this.status === NewsletterStatus.SCHEDULED;
  }

  get canSend(): boolean {
    return this.status === NewsletterStatus.DRAFT || this.status === NewsletterStatus.SCHEDULED;
  }

  get openRate(): number {
    if (this.sentCount === 0) return 0;
    return Math.round((this.openCount / this.sentCount) * 100 * 10) / 10;
  }

  get clickRate(): number {
    if (this.sentCount === 0) return 0;
    return Math.round((this.clickCount / this.sentCount) * 100 * 10) / 10;
  }
}
