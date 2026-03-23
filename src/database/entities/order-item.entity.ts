import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column()
  variantId: string;

  /** Snapshot del nome prodotto al momento dell'ordine */
  @Column()
  productName: string;

  /** Snapshot dello SKU variante al momento dell'ordine */
  @Column({ nullable: true })
  productSku: string;

  /**
   * Taglia selezionata al momento dell'ordine (snapshot).
   * Necessaria per il decremento stock e per il tracciamento inventario.
   */
  @Column({ nullable: true })
  size: string;

  /** Colore snapshot al momento dell'ordine */
  @Column({ nullable: true })
  colorName: string;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;

  @Column('decimal', { precision: 10, scale: 2 })
  total: number;

  @ManyToOne(() => Order, order => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @ManyToOne(() => ProductVariant, v => v.orderItems, { eager: false })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;
}
