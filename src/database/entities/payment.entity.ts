import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index, Check } from 'typeorm';
import { NumericTransformer } from '../transformers/numeric.transformer';
import { Order } from './order.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}
export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer'
}

@Entity('payments')
@Check(`"amount" >= 0`)
@Check(`"refundedAmount" >= 0`)
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Order, order => order.payment)
  @JoinColumn()
  order: Order;

  @Column()
  @Index()
  orderId: string;

  @Column('numeric', { precision: 10, scale: 2, transformer: NumericTransformer })
  amount: number;

  @Column({ default: 'eur' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  @Index()
  status: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ nullable: true })
  @Index()
  stripePaymentIntentId: string;

  @Column({ nullable: true })
  stripeChargeId: string;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column('jsonb', { nullable: true })
  stripePaymentMethodDetails: Record<string, any>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSessionId?: string;

  @Column({ type: 'jsonb', nullable: true })
  stripeSessionDetails?: {
    sessionId: string;
    paymentStatus: string;
    amountTotal: number;
    amountSubtotal: number;
    taxAmount: number;
    completedAt?: Date;
  };

  @Column('numeric', { precision: 10, scale: 2, default: 0, transformer: NumericTransformer })
  refundedAmount: number;

  @Column({ nullable: true })
  failureReason: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}