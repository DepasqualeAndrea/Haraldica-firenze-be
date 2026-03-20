import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index, Check,
} from 'typeorm';
import { Cart } from './cart.entity';
import { ProductVariant } from './product-variant.entity';

/**
 * SECURITY: Price Lock
 *
 * `lockedPrice` memorizza il prezzo effettivo della variante al momento
 * dell'aggiunta al carrello. Previene attacchi di price manipulation:
 *  1. Utente aggiunge variante al carrello a €250
 *  2. Admin cambia basePrice a €100 per errore
 *  3. Il checkout usa lockedPrice → €250 (invariato)
 *
 * Se il prezzo cambia significativamente (>10%), il FE notifica l'utente.
 */
@Entity('cart_items')
@Check(`"quantity" > 0`)
@Index(['cartId', 'variantId'], { unique: true })
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  cartId: string;

  @Column()
  @Index()
  variantId: string;

  @Column()
  quantity: number;

  /** SECURITY: prezzo bloccato al momento dell'aggiunta. Usato al checkout. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  lockedPrice?: number;

  /** Timestamp del blocco prezzo */
  @Column({ type: 'timestamp', nullable: true })
  priceLockTimestamp?: Date;

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Cart, cart => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @ManyToOne(() => ProductVariant, v => v.cartItems)
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  /** True se il prezzo corrente della variante è cambiato rispetto al locked */
  hasPriceChanged(currentPrice: number, threshold = 0.01): boolean {
    if (!this.lockedPrice) return false;
    return Math.abs(Number(this.lockedPrice) - currentPrice) > threshold;
  }

  getPriceChangePercent(currentPrice: number): number {
    if (!this.lockedPrice) return 0;
    return ((currentPrice - Number(this.lockedPrice)) / Number(this.lockedPrice)) * 100;
  }
}
