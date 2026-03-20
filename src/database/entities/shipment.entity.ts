import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';
import { Order } from './order.entity';

export enum ShipmentStatus {
  CREATED = 'created',
  PAID = 'paid',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  EXCEPTION = 'exception',
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  orderId: string;

  @ManyToOne(() => Order, o => o.shipment, { onDelete: 'CASCADE' })
  order: Order;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tariffCode?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  carrier?: string;

  @Index()
  @Column({ nullable: true })
  trackingCode?: string;

  @Column({ type: 'jsonb', nullable: true })
  trackingEvents?: Array<{ date: string; time?: string; description: string; location?: string }>;

  @Column({ type: 'enum', enum: ShipmentStatus, default: ShipmentStatus.CREATED })
  @Index()
  status: ShipmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedDeliveryDate?: Date;

  @Column({ default: false })
  labelDownloaded: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  labelFilePath?: string;

  @Column({ type: 'jsonb', nullable: true })
  providerMetadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}