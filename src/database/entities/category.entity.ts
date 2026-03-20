import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, ManyToOne, Index, Check,
} from 'typeorm';
import { Product } from './product.entity';
import { ClothingCategory } from '../enums/clothing-category.enum';

@Entity('categories')
@Check(`"sortOrder" >= 0`)
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  name: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  clothingType?: ClothingCategory;

  // ── Hierarchy ─────────────────────────────────────────────────────────────

  @ManyToOne(() => Category, c => c.children, { nullable: true })
  parent?: Category;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  parentId: string | null;

  @OneToMany(() => Category, c => c.parent)
  children: Category[];

  @OneToMany(() => Product, p => p.category)
  products: Product[];

  // ── SEO ───────────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  metaTitle?: string;

  @Column('text', { nullable: true })
  metaDescription?: string;

  // ── Timestamps ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
