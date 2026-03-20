import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index, Check } from 'typeorm';
import { NumericTransformer } from '../transformers/numeric.transformer';
import { Order } from './order.entity';

export enum CouponType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  FREE_SHIPPING = 'free_shipping'
}
export enum CouponStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired'
}

@Entity('coupons')
@Check(`"value" >= 0`)
@Check(`"minimumOrderAmount" IS NULL OR "minimumOrderAmount" >= 0`)
@Check(`"maximumDiscountAmount" IS NULL OR "maximumDiscountAmount" >= 0`)
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  code: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'enum', enum: CouponType })
  type: CouponType;

  @Column('numeric', { precision: 10, scale: 2, transformer: NumericTransformer })
  value: number;

  @Column('numeric', { precision: 10, scale: 2, nullable: true, transformer: NumericTransformer })
  minimumOrderAmount: number;

  @Column('numeric', { precision: 10, scale: 2, nullable: true, transformer: NumericTransformer })
  maximumDiscountAmount: number;

  @Column({ nullable: true })
  usageLimit: number;

  @Column({ default: 1 })
  usageLimitPerUser: number;

  @Column({ default: 0 })
  usedCount: number;

  @Column()
  validFrom: Date;

  @Column()
  validUntil: Date;

  @Column({ type: 'enum', enum: CouponStatus, default: CouponStatus.ACTIVE })
  @Index()
  status: CouponStatus;

  @Column('jsonb', { nullable: true })
  applicableProducts: string[];

  @Column('jsonb', { nullable: true })
  applicableCategories: string[];

  @Column('jsonb', { nullable: true })
  excludedProducts: string[];

  @Column('jsonb', { nullable: true })
  excludedCategories: string[];

  @Column({ default: false })
  isFirstOrderOnly: boolean;

  // Influencer/Collaborator tracking - nome della persona a cui è assegnato il coupon per distribuzione
  @Column({ nullable: true })
  @Index()
  collaborator: string;

  // Note interne per admin (es. "Campagna Instagram Gennaio 2026")
  @Column('text', { nullable: true })
  internalNotes: string;

  @OneToMany(() => Order, order => order.coupon)
  orders: Order[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}