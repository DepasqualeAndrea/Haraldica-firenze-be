import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index, Check,
} from 'typeorm';
import { Product, SignatureDetailJson } from './product.entity';
import { CartItem } from './cart-item.entity';
import { OrderItem } from './order-item.entity';
import { NumericTransformer } from '../transformers/numeric.transformer';

/**
 * ProductVariant — rappresenta UN COLORE di un prodotto.
 *
 * La taglia NON è più parte dell'entità variante: ogni variante gestisce
 * tutte le taglie tramite `stockPerSize` (JSONB).
 *
 * Esempio: Variant "Blu Navy" ha stockPerSize = { XS:3, S:5, M:8, L:10, XL:0, XXL:2 }
 * SKU: "ABITO-NAVY" (non include più la taglia)
 */
@Entity('product_variants')
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

  // ── Identificazione ───────────────────────────────────────────────────────

  /**
   * SKU univoco per colore. Solo maiuscolo, numeri e trattini.
   * Es: "ABITO-NAVY", "CAPPOTTO-BEIGE"
   */
  @Column({ unique: true })
  sku: string;

  /** Nome colore leggibile. Es: "Blu Oltremare", "Bianco Avorio" */
  @Column()
  colorName: string;

  /** Codice HEX per il pallino colore nel FE. Es: "#120A8F" */
  @Column({ length: 7 })
  colorHex: string;

  // ── Inventario per taglia ─────────────────────────────────────────────────

  /**
   * Stock disponibile per ogni taglia.
   * Le chiavi corrispondono a product.sizes.
   * Es: { "XS": 3, "S": 5, "M": 8, "L": 10, "XL": 0, "XXL": 2 }
   *
   * Una taglia assente o a 0 = esaurita.
   * Il decremento avviene al checkout confermato (webhook Stripe).
   */
  @Column({ type: 'jsonb', default: {} })
  stockPerSize: Record<string, number>;

  // ── Pricing ───────────────────────────────────────────────────────────────

  /**
   * Sovrascrive il basePrice del prodotto per questo colore.
   * Es. edizione limitata, colore premium.
   */
  @Column('numeric', { precision: 10, scale: 2, nullable: true, transformer: NumericTransformer })
  variantPriceOverride?: number;

  // ── Media ─────────────────────────────────────────────────────────────────

  /**
   * Immagini specifiche per questo colore (su Supabase Storage).
   * Primo elemento = immagine principale del colore.
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  images?: string[];

  /**
   * Dettagli di qualità specifici per questo colore.
   * Es: bottoni diversi, fodera con pattern unico, cuciture a contrasto.
   * Sovrascrivono o integrano i signatureDetails del prodotto padre.
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  signatureDetails?: SignatureDetailJson[];

  // ── Display order ─────────────────────────────────────────────────────────

  /**
   * Ordine di visualizzazione nel selettore colori (0 = primo).
   * La variante con sortOrder più basso è quella mostrata per prima.
   */
  @Column({ default: 0 })
  sortOrder: number;

  /**
   * Se true, questa è la variante mostrata per default quando si apre
   * la scheda prodotto. Solo una variante per prodotto dovrebbe averla true.
   * Il BE non la forza in modo esclusivo: è responsabilità del FE/admin.
   */
  @Column({ default: false })
  isDefault: boolean;

  // ── Status ────────────────────────────────────────────────────────────────

  @Column({ default: true })
  isActive: boolean;

  // ── Logistics ─────────────────────────────────────────────────────────────

  /** EAN-13 or UPC barcode. */
  @Column({ nullable: true })
  barcode?: string;

  /** Peso medio del capo per calcolo spedizione. */
  @Column('numeric', { precision: 8, scale: 3, nullable: true, transformer: NumericTransformer })
  weight?: number;

  @Column({ length: 2, nullable: true, default: 'kg' })
  weightUnit?: string;

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

  /** Stock totale sommando tutte le taglie */
  get totalStock(): number {
    return Object.values(this.stockPerSize || {}).reduce((sum, qty) => sum + qty, 0);
  }

  /** Taglie con stock > 0 */
  get availableSizes(): string[] {
    return Object.entries(this.stockPerSize || {})
      .filter(([, qty]) => qty > 0)
      .map(([size]) => size);
  }

  /** Stock per una taglia specifica */
  getStockForSize(size: string): number {
    return this.stockPerSize?.[size] ?? 0;
  }

  /** Taglia disponibile? */
  isSizeAvailable(size: string): boolean {
    return this.isActive && this.getStockForSize(size) > 0;
  }

  isInStock(): boolean {
    return this.isActive && this.totalStock > 0;
  }
}
