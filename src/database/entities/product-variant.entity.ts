import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index, Check,
} from 'typeorm';
import { Product } from './product.entity';
import { CartItem } from './cart-item.entity';
import { OrderItem } from './order-item.entity';
import { NumericTransformer } from '../transformers/numeric.transformer';

/**
 * ProductVariant — l'oggetto fisico a magazzino.
 *
 * Un Product ha N varianti. Ogni variante rappresenta una combinazione
 * univoca di taglia + colore con il proprio stock e, opzionalmente,
 * un prezzo differente dal basePrice del prodotto padre.
 *
 * Lo SKU è il codice univoco che identifica fisicamente il capo:
 *   es. CAM-SET-BIA-IT42 → Camicia / Seta / Bianca / Taglia IT42
 */
@Entity('product_variants')
@Check(`"stock" >= 0`)
@Check(`"reservedStock" >= 0`)
@Check(`"variantPriceOverride" IS NULL OR "variantPriceOverride" >= 0`)
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  productId: string;

  @ManyToOne(() => Product, p => p.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // ── Identificazione fisica ────────────────────────────────────────────────

  /** Codice SKU univoco. Solo maiuscolo, numeri e trattini. Es: CAM-SET-BIA-IT42 */
  @Column({ unique: true })
  sku: string;

  /** Taglia: S | M | L | XL | IT44 | IT46 | 42 (scarpe) */
  @Column()
  size: string;

  /** Nome colore leggibile. Es: "Blu Oltremare", "Bianco Avorio" */
  @Column()
  colorName: string;

  /** Codice HEX per il pallino colore nel FE. Es: "#120A8F" */
  @Column({ length: 7 })
  colorHex: string;

  // ── Inventario ───────────────────────────────────────────────────────────

  @Column({ type: 'integer', default: 0 })
  @Index()
  stock: number;

  /** Stock prenotato (ordini in corso, non ancora confermati) */
  @Column({ type: 'integer', default: 0 })
  reservedStock: number;

  // ── Pricing ───────────────────────────────────────────────────────────────

  /**
   * Se null: usa product.basePrice.
   * Se valorizzato: sovrascrive il prezzo base (es. cashmere extra-fine, taglia speciale).
   */
  @Column('numeric', { precision: 10, scale: 2, nullable: true, transformer: NumericTransformer })
  variantPriceOverride?: number;

  // ── Media ─────────────────────────────────────────────────────────────────

  /**
   * Array di URL immagini su Supabase Storage specifici per questo colore.
   * Primo elemento = immagine principale del colore.
   */
  @Column('jsonb', { nullable: true, default: () => "'[]'::jsonb" })
  images?: string[];

  // ── Status ────────────────────────────────────────────────────────────────

  @Column({ default: true })
  isActive: boolean;

  // ── Relations ─────────────────────────────────────────────────────────────

  @OneToMany(() => CartItem, ci => ci.variant)
  cartItems: CartItem[];

  @OneToMany(() => OrderItem, oi => oi.variant)
  orderItems: OrderItem[];

  // ── Timestamps ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Prezzo effettivo: override ?? product.basePrice */
  get effectivePrice(): number {
    return this.variantPriceOverride ?? this.product?.basePrice;
  }

  /** Stock disponibile al pubblico (stock fisico - prenotato) */
  get availableStock(): number {
    return Math.max(0, this.stock - (this.reservedStock || 0));
  }

  isInStock(): boolean {
    return this.isActive && this.availableStock > 0;
  }
}
