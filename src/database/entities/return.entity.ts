import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { ReturnItem } from './return-item.entity';
import { ReturnReason } from '../../modules/public-api/returns/enums/return-reason.enum';
import { ReturnStatus } from '../../modules/public-api/returns/enums/return-status.enum';
import { Order } from './order.entity';
import { User } from './user.entity';

@Entity('returns')
export class Return {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ===========================
  // IDENTIFIERS
  // ===========================
  @Column({ unique: true })
  returnNumber: string; // RMA-2024-001234

  // ===========================
  // RELATIONS
  // ===========================
  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @OneToMany(() => ReturnItem, (item) => item.return, {
    cascade: true,
    eager: true,
  })
  items: ReturnItem[];

  // ===========================
  // STATUS & WORKFLOW
  // ===========================
  @Column({
    type: 'enum',
    enum: ReturnStatus,
    default: ReturnStatus.REQUESTED,
  })
  status: ReturnStatus;

  @Column({
    type: 'enum',
    enum: ReturnReason,
  })
  reason: ReturnReason;

  // ===========================
  // CUSTOMER INFO
  // ===========================
  @Column({ type: 'text', nullable: true })
  customerNotes: string; // Note del cliente nella richiesta

  @Column('simple-array', { nullable: true })
  customerPhotos: string[]; // URL foto caricate dal cliente

  @Column()
  customerEmail: string; // Per notifiche

  // ===========================
  // ADMIN REVIEW
  // ===========================
  @Column({ type: 'text', nullable: true })
  adminNotes: string; // Note private admin

  @Column('simple-array', { nullable: true })
  adminPhotos: string[]; // Foto controllo qualità admin

  @Column({ nullable: true })
  inspectedBy: string; // ID admin che ha fatto controllo

  @Column({ type: 'timestamp', nullable: true })
  inspectedAt: Date;

  // ===========================
  // SHIPPING INFO
  // ===========================
  @Column({ nullable: true })
  returnTrackingNumber: string; // Tracking spedizione reso

  @Column({ nullable: true })
  returnCarrier: string; // Corriere usato per il reso

  @Column({ type: 'timestamp', nullable: true })
  shippedAt: Date; // Quando cliente ha spedito

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date; // Quando pacco è arrivato

  // ===========================
  // REFUND INFO
  // ===========================
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  refundAmount: number; // Importo rimborsato

  @Column({ nullable: true })
  stripeRefundId: string; // ID rimborso Stripe

  @Column({ type: 'timestamp', nullable: true })
  refundedAt: Date;

  @Column({ default: false })
  stockReintegrated: boolean; // Se stock è stato reintegrato

  // ===========================
  // TIMELINE EVENTS
  // ===========================
  @Column({ type: 'jsonb', default: '[]' })
  timeline: Array<{
    status: ReturnStatus;
    timestamp: Date;
    performedBy?: string; // user/admin ID
    notes?: string;
  }>;

  // ===========================
  // METADATA
  // ===========================
  @Column({ type: 'text', nullable: true })
  rejectionReason: string; // Motivo rifiuto dettagliato

  @Column({ default: false })
  requiresAdditionalInfo: boolean; // Se admin ha richiesto più info

  @Column({ type: 'text', nullable: true })
  additionalInfoRequest: string; // Cosa serve (es. "foto più chiara del sigillo")

  @Column({ default: 0 })
  totalValue: number; // Valore totale prodotti da rendere

  // ===========================
  // TIMESTAMPS
  // ===========================
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ===========================
  // COMPUTED PROPERTIES
  // ===========================
  get isRefundable(): boolean {
    return [
      ReturnStatus.APPROVED,
      ReturnStatus.PARTIALLY_APPROVED,
    ].includes(this.status);
  }

  get isCancellable(): boolean {
    return [
      ReturnStatus.REQUESTED,
      ReturnStatus.PENDING_INFO,
      ReturnStatus.APPROVED_FOR_RETURN,
    ].includes(this.status);
  }

  get requiresAction(): boolean {
    return [
      ReturnStatus.REQUESTED,
      ReturnStatus.RECEIVED,
      ReturnStatus.INSPECTING,
    ].includes(this.status);
  }

  get isFinal(): boolean {
    return [
      ReturnStatus.REFUNDED,
      ReturnStatus.PARTIALLY_REFUNDED,
      ReturnStatus.REJECTED,
      ReturnStatus.REJECTED_PRE_INSPECTION,
      ReturnStatus.CANCELLED,
    ].includes(this.status);
  }

  get daysOpen(): number {
    return Math.floor(
      (new Date().getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }
}