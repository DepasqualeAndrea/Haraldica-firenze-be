import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Return } from './return.entity';
import { OrderItem } from './order-item.entity';
import { ProductVariant } from './product-variant.entity';

export enum InspectionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('return_items')
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Return, ret => ret.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'returnId' })
  return: Return;

  @Column()
  returnId: string;

  @ManyToOne(() => OrderItem, { nullable: false })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItem;

  @Column()
  orderItemId: string;

  @ManyToOne(() => ProductVariant, { nullable: false })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  @Column()
  variantId: string;

  // ── Snapshot al momento del reso ────────────────────────────────────────

  @Column()
  productName: string;

  @Column({ nullable: true })
  productSku?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  // ── Ispezione qualità ────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: InspectionStatus, default: InspectionStatus.PENDING })
  inspectionStatus: InspectionStatus;

  /** Etichette/tag originali ancora attaccati */
  @Column({ default: false })
  tagsAttached: boolean;

  @Column({ default: false })
  productConforms: boolean;

  @Column({ type: 'text', nullable: true })
  inspectionNotes?: string;

  @Column('simple-array', { nullable: true })
  inspectionPhotos?: string[];

  // ── Rimborso ─────────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  refundAmount: number;

  @Column({ default: false })
  stockReintegrated: boolean;

  // ── Timestamps ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Computed ──────────────────────────────────────────────────────────────

  get total(): number { return this.unitPrice * this.quantity; }
  get isApproved(): boolean { return this.inspectionStatus === InspectionStatus.APPROVED; }
  get isRejected(): boolean { return this.inspectionStatus === InspectionStatus.REJECTED; }
  get isPending(): boolean { return this.inspectionStatus === InspectionStatus.PENDING; }
}
