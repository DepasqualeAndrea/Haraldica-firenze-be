import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, ManyToOne, Index, Check, JoinColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { Category } from './category.entity';
import { Review } from './review.entity';
import { ProductVariant } from './product-variant.entity';
import { NumericTransformer } from '../transformers/numeric.transformer';

// ── JSONB shape interfaces ─────────────────────────────────────────────────────

export interface ProductDetailsJson {
  made_in?: string;
  attributes?: string[];
  detailing?: string[];
  item_code?: string;
}

export interface ProductSizeFitJson {
  fit_type?: string;
  advice?: string;
  model?: {
    name?: string;
    height_cm?: number;
    chest_cm?: number;
    waist_cm?: number;
    wearing_size?: string;
  };
  measurements?: {
    label: string;
    values: Record<string, number>;
  }[];
}

export interface ProductFabricCareJson {
  composition?: string;
  washing?: string;
  day_to_day?: string;
}

export interface ProductShippingReturnsJson {
  shipping_text?: string;
  returns_text?: string;
}

/**
 * Singolo dettaglio di qualità/manifattura con immagini dedicate.
 * Es: "Asole a mano", "Bottoni in madreperla", "Fodera in seta"
 */
export interface SignatureDetailJson {
  label: string;         // "Hand-stitched buttonholes"
  description?: string;  // Testo descrittivo della lavorazione
  images: string[];      // Close-up photos di questo dettaglio
}

@Entity('products')
@Check(`"basePrice" >= 0`)
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  name: string;

  @Column({ unique: true, nullable: true })
  @Index()
  slug?: string;

  @Column('text')
  description: string;

  @Column('numeric', { precision: 10, scale: 2, transformer: NumericTransformer })
  basePrice: number;

  // ── Clothing fields ────────────────────────────────────────────────────────

  /** Es. "100% Cashmere Mongoliano", "Seta 100%", "Vera Pelle Toscana" */
  @Column('text')
  materials: string;

  /** Vestibilità: Slim | Regular | Oversize | Tailored */
  @Column({ nullable: true })
  fit?: string;

  /** Es. "Handmade in Tuscany, Italy" */
  @Column()
  origin: string;

  /** Es. "Lavaggio a secco", "Non stirare" */
  @Column('text', { nullable: true })
  careInstructions?: string;

  /** Es. "Capsule Collection AW2025" */
  @Column({ nullable: true })
  productLine?: string;

  // ── Full-Spec luxury fields ────────────────────────────────────────────────

  /** Brand/vendor name. Es. "Mackintosh x C.P. Company" */
  @Column({ nullable: true })
  vendor?: string;

  /** Product type label. Es. "Coat", "Shirt" */
  @Column({ nullable: true })
  productType?: string;

  /** ISO 4217 currency code. Defaults to EUR. */
  @Column({ length: 3, default: 'EUR' })
  currency: string;

  /** Free-form tags. Stored as PostgreSQL TEXT[]. */
  @Column('text', { array: true, nullable: true, default: '{}' })
  tags?: string[];

  /** Datetime the product was (or will be) made public. */
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  /** HTML-formatted description. Coexists with plain-text `description`. */
  @Column('text', { nullable: true })
  descriptionHtml?: string;

  // ── JSONB rich-data columns ────────────────────────────────────────────────

  /** Product details tab: provenance, attributes, detailing, item code. */
  @Column({ type: 'jsonb', nullable: true })
  details?: ProductDetailsJson;

  /** Size & Fit tab: fit type, advice, model info, measurements table. */
  @Column({ type: 'jsonb', nullable: true })
  sizeFit?: ProductSizeFitJson;

  /** Fabric & Care tab: composition, washing, day-to-day care. */
  @Column({ type: 'jsonb', nullable: true })
  fabricCare?: ProductFabricCareJson;

  /** Shipping & Returns tab: descriptive texts. */
  @Column({ type: 'jsonb', nullable: true })
  shippingReturns?: ProductShippingReturnsJson;

  /**
   * Dettagli di qualità/manifattura del prodotto con immagini dedicate.
   * Es: asole a mano, bottoni madreperla, costruzione canvas, ecc.
   * Mostrati nella sezione "Signature Details" della pagina prodotto.
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  signatureDetails?: SignatureDetailJson[];

  /**
   * Tutte le taglie in cui esiste il prodotto (range completo: XS→XXL).
   * Indipendente dalle varianti: mostra l'intera gamma, anche se
   * alcune taglie sono esaurite o non ancora create come varianti.
   * Es. ["XS","S","M","L","XL","XXL"]
   */
  @Column('text', { array: true, nullable: true, default: '{}' })
  sizes?: string[];

  // ── Catalog flags ──────────────────────────────────────────────────────────

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @Column({ default: false })
  @Index()
  isFeatured: boolean;

  @Column({ default: false })
  @Index()
  isOnSale: boolean;

  // ── Stripe ─────────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  stripeProductId?: string;

  // ── Stats ──────────────────────────────────────────────────────────────────

  @Column('numeric', { precision: 2, scale: 1, default: 0, transformer: NumericTransformer })
  averageRating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  salesCount: number;

  // ── SEO ───────────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  metaTitle?: string;

  @Column('text', { nullable: true })
  metaDescription?: string;

  // ── Relations ─────────────────────────────────────────────────────────────

  @ManyToOne(() => Category, category => category.products)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  @Index()
  categoryId: string;

  @OneToMany(() => ProductVariant, v => v.product, { cascade: true })
  variants: ProductVariant[];

  @OneToMany(() => Review, review => review.product)
  reviews: Review[];

  @OneToMany(() => OrderItem, oi => oi.variant)
  orderItems: OrderItem[];

  // ── Timestamps ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** True se almeno una variante è disponibile */
  isInStock(): boolean {
    return this.variants?.some(v => v.isInStock()) ?? false;
  }

  /** Punteggio popolarità per sorting */
  getPopularityScore(): number {
    return this.salesCount * 0.7 + (this.averageRating * this.reviewCount) * 0.3;
  }

  /** Trending: buone vendite + relativamente nuovo (< 90 giorni) */
  isTrending(): boolean {
    const days = Math.floor((Date.now() - new Date(this.createdAt).getTime()) / 86_400_000);
    return days < 90 && this.salesCount > 50 && this.averageRating > 4.0;
  }

  getSeoMetadata() {
    return {
      title: this.metaTitle || `${this.name} | Haraldica Firenze`,
      description: this.metaDescription || `${this.description.substring(0, 150)}...`,
      price: this.basePrice,
      currency: this.currency ?? 'EUR',
      availability: this.isInStock() ? 'in stock' : 'out of stock',
      rating: this.averageRating,
      reviewCount: this.reviewCount,
      category: this.category?.name,
    };
  }
}
