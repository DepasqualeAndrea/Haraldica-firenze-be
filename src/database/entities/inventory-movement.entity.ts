import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Check,
} from 'typeorm';
import { NumericTransformer } from '../transformers/numeric.transformer';
import { ProductVariant } from './product-variant.entity';
import { User } from './user.entity';

export enum InventoryMovementType {
  IN = 'in',
  OUT = 'out',
  SALE = 'sale',
  RETURN = 'return',
  ADJUSTMENT = 'adjustment',
  DAMAGE = 'damage',
}

@Entity('inventory')
@Check(`"quantity" <> 0`)
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  variantId: string;

  @Column({ type: 'enum', enum: InventoryMovementType })
  movementType: InventoryMovementType;

  @Column()
  quantity: number;

  @Column()
  quantityBefore: number;

  @Column()
  quantityAfter: number;

  @Column('numeric', { precision: 10, scale: 2, nullable: true, transformer: NumericTransformer })
  unitCost?: number;

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  supplierId?: string;

  /** Numero di lotto/collo per tracciabilità magazzino */
  @Column({ nullable: true })
  batchNumber?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  reason?: string;

  @Column('text', { nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;
}
