import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Check, Unique,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { Order } from './order.entity';

export enum ReservationStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

@Entity('stock_reservations')
@Unique('UQ_stock_reservation_order_variant', ['orderId', 'variantId'])
@Check(`"quantity" > 0`)
export class StockReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  variantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  @Column()
  @Index()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'enum', enum: ReservationStatus, default: ReservationStatus.RESERVED })
  @Index()
  status: ReservationStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  reservedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  expiresAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  releasedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    userType?: 'guest' | 'customer';
    userId?: string;
    customerEmail?: string;
    autoReleased?: boolean;
    releaseReason?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  isActive(): boolean {
    return this.status === ReservationStatus.RESERVED && !this.isExpired();
  }

  getMinutesUntilExpiry(): number {
    if (!this.expiresAt) return 0;
    return Math.max(0, Math.floor((this.expiresAt.getTime() - Date.now()) / 60_000));
  }

  canBeConfirmed(): boolean {
    return this.status === ReservationStatus.RESERVED && !this.isExpired();
  }

  canBeReleased(): boolean {
    return this.status === ReservationStatus.RESERVED || this.status === ReservationStatus.EXPIRED;
  }

  setExpiry(hours = 2): void {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + hours);
    this.expiresAt = expiry;
  }
}
