// src/database/entities/cart.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';
import { User } from './user.entity';
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false, name: 'user_id' })
  @Index('IDX_cart_user_id') // ✅ Nome esplicito
  userId: string;

  @ManyToOne(() => User, user => user.carts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column('numeric', { precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column('int', { default: 0 })
  totalItems: number;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true, eager: true })
  items: CartItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ===========================
  // 🛠️ HELPER METHODS (SEMPLIFICATI)
  // ===========================

  isGuest(): boolean {
    return this.user?.isGuest ?? false;
  }

  isCustomer(): boolean {
    return !this.isGuest();
  }

  getType(): 'guest' | 'customer' {
    return this.isGuest() ? 'guest' : 'customer';
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  isEmpty(): boolean {
    return !this.items || this.items.length === 0;
  }

  getTotalItems(): number {
    return this.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  }

  extendExpiry(days: number = 7): void {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + days);
    this.expiresAt = newExpiry;
  }
}