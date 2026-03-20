// src/database/entities/order.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  Index,
  Check,
  BeforeInsert,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';
import { Coupon } from './coupon.entity';
import { Review } from './review.entity';
import { Shipment } from './shipment.entity';
import { NumericTransformer } from '../transformers/numeric.transformer';
import { randomUUID } from 'crypto';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  READY_TO_SHIP = 'ready_to_ship',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum OrderType {
  CUSTOMER = 'customer',
  GUEST = 'guest',
}

@Entity('orders')
@Check(`"subtotal" >= 0 AND "total" >= 0 AND "shippingCost" >= 0 AND "taxAmount" >= 0`)
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: false })
  orderNumber: string;

  @Column({ type: 'uuid', unique: true, nullable: true })
  trackingToken?: string;

  @Column({ type: 'enum', enum: OrderType, default: OrderType.CUSTOMER })
  orderType: OrderType;

  // ✅ UNIFICATO - userId per guest E customer
  @ManyToOne(() => User, user => user.orders)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ nullable: true })
  @Index()
  userId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  customerEmail?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  lastCheckoutEmail?: string | null;

  // ===========================
  // PRICING
  // ===========================

  @Column('decimal', { precision: 10, scale: 2 })
  subtotal: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingCost: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSessionId?: string;

  @Column({ type: 'jsonb', nullable: true })
  stripeTaxDetails?: {
    taxAmount: number;
    taxBreakdown: Array<{
      amount: number;
      rate: string;
      jurisdiction: string;
    }>;
    calculatedAt: Date;
  };

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  taxAmount: number;

  @ManyToOne(() => Coupon, coupon => coupon.orders, { nullable: true })
  coupon?: Coupon;

  @Column({ nullable: true })
  couponId?: string;

  @Column({ nullable: true })
  couponCode?: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    transformer: NumericTransformer
  })
  total: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING
  })
  @Index()
  status: OrderStatus;

  // ===========================
  // ADDRESSES
  // ===========================

  @Column({ type: 'jsonb', nullable: true })
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    province?: string;
    civicNumber?: string;
    provinceCode?: string;
    phone?: string;
  };

  @Column('jsonb', { nullable: true })
  billingAddress?: {
    name: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
    province?: string;
    provinceCode?: string;
    vatNumber?: string;
  };

  // ===========================
  // METADATA
  // ===========================

  @Column({ nullable: true })
  notes?: string;

  @Column({ nullable: true })
  trackingNumber?: string;

  @Column({ nullable: true })
  @Index()
  stripePaymentIntentId?: string;

  @Column('jsonb', { nullable: true })
  stripeMetadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  estimatedDelivery?: Date;

  // ===========================
  // RELATIONS
  // ===========================

  @OneToMany(() => OrderItem, orderItem => orderItem.order, { cascade: true })
  items: OrderItem[];

  @OneToOne(() => Payment, payment => payment.order, { nullable: true })
  payment?: Payment;

  @OneToMany(() => Review, review => review.order, { nullable: true })
  reviews?: Review[];

  @OneToOne(() => Shipment, shipment => shipment.order, { nullable: true })
  shipment?: Shipment;

  @Column({ nullable: true })
  shipmentId?: string;

  // ===========================
  // SHIPPING (BRT)
  // ===========================

  // Campi BRT Shipping
  @Column({ type: 'varchar', length: 255, nullable: true })
  brtShipmentId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brtTrackingNumber?: string;

  @Column({ type: 'jsonb', nullable: true })
  brtShipmentData?: any;

  // ===========================
  // EMAIL RECOVERY
  // ===========================

  @Column({ default: false })
  recoveryEmailSent: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  recoveryEmailSentAt?: Date;

  @Column({ default: 0 })
  recoveryEmailCount: number;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  // ===========================
  // STOCK RESERVATION
  // ===========================

  @Column({ type: 'boolean', default: false })
  stockReserved: boolean;

  @Column({ type: 'timestamp', nullable: true })
  stockReservedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  stockReservationExpiresAt?: Date;

  // ===========================
  // TIMESTAMPS
  // ===========================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ===========================
  // HOOKS
  // ===========================

  @BeforeInsert()
  setDefaults() {
    if (!this.orderNumber) {
      this.orderNumber = Order.generateOrderNumber();
    }
    if (!this.trackingToken) {
      this.trackingToken = randomUUID();
    }
    if (!this.status) {
      this.status = OrderStatus.PENDING;
    }
    if (this.shippingCost == null) {
      this.shippingCost = 0;
    }
    if (this.taxAmount == null) {
      this.taxAmount = 0;
    }
    if (this.discountAmount == null) {
      this.discountAmount = 0;
    }
  }

  // ===========================
  // 🛠️ HELPER METHODS
  // ===========================

  static generateOrderNumber(): string {
    // Genera UUID univoco per evitare conflitti BRT
    // Formato: MRV-YYYYMMDD-{UUID_SHORT_8_CHARS}
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    // UUID short (primi 8 caratteri) per leggibilità
    const uuidShort = randomUUID().split('-')[0].toUpperCase();
    
    return `MVR-${yyyy}${mm}${dd}-${uuidShort}`;
  }

  isEditable(): boolean {
    return (
      this.status === OrderStatus.PENDING ||
      this.status === OrderStatus.CONFIRMED ||
      this.status === OrderStatus.PROCESSING
    );
  }

  /**
   * 🔒 Verifica se l'ordine può essere modificato (indirizzi, prodotti, etc.)
   * 
   * BLOCCO MODIFICHE dopo READY_TO_SHIP perché l'etichetta è stata creata
   * 
   * Stati modificabili: PENDING, CONFIRMED, PROCESSING
   * Stati NON modificabili: PROCESSING (elaborazione), READY_TO_SHIP, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED
   */
  canBeModified(): boolean {
    const unmodifiableStates = [
      OrderStatus.PROCESSING,      // In elaborazione da sistema - non modificabile
      OrderStatus.READY_TO_SHIP,
      OrderStatus.SHIPPED,
      OrderStatus.IN_TRANSIT,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED
    ];
    
    return !unmodifiableStates.includes(this.status);
  }

  isCancellable(): boolean {
    return (
      this.status === OrderStatus.PENDING ||
      this.status === OrderStatus.CONFIRMED
    );
  }

  isRefundable(): boolean {
    return (
      this.status === OrderStatus.DELIVERED ||
      this.status === OrderStatus.CONFIRMED
    );
  }

  canBeShipped(): boolean {
    return (
      this.status === OrderStatus.CONFIRMED ||
      this.status === OrderStatus.PROCESSING
    );
  }

  calculateFinalTotal(): number {
    return this.subtotal + this.shippingCost - this.discountAmount;
  }

  hasCoupon(): boolean {
    return !!this.couponCode && this.discountAmount > 0;
  }

  isGuestOrder(): boolean {
    return this.orderType === OrderType.GUEST || this.user?.isGuest || false;
  }

  getCustomerEmail(): string | null {
    return this.customerEmail ?? this.user?.email ?? null;
  }

  getCustomer(): User | null {
    return this.user || null;
  }

  canInviteToRegister(): boolean {
    return (
      this.isGuestOrder() &&
      (this.user?.shouldInviteToRegister() || false)
    );
  }

  hasShipment(): boolean {
    return !!this.shipment || !!this.shipmentId;
  }

  canCreateShipment(): boolean {
    return (
      !this.hasShipment() &&
      (this.status === OrderStatus.CONFIRMED ||
        this.status === OrderStatus.PROCESSING)
    );
  }
}