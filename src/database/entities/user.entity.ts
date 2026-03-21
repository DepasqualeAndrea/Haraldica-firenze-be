import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, OneToMany, OneToOne, Index,
} from 'typeorm';
import { Order } from './order.entity';
import { Address } from './address.entity';
import { Review } from './review.entity';
import { Consent } from './consent.entity';
import { Cart } from './cart.entity';
import { Wishlist } from './wishlist.entity';

export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  GUEST = 'guest',
}

@Entity('users')
@Index(['email'], { unique: true })
@Index(['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email?: string;

  /** Usato per guest checkout: email inserita al pagamento */
  @Column({ nullable: true })
  lastCheckoutEmail?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ nullable: true })
  gender?: string; // 'M' | 'F' | 'altro'

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  // ── Supabase Auth ────────────────────────────────────────────────────────

  /**
   * ID dell'utente in Supabase Auth (auth.users.id).
   * Null per utenti guest (sessione anonima Supabase).
   */
  @Column({ unique: true, nullable: true })
  @Index()
  supabaseId?: string;

  /** True se l'utente ha abilitato TOTP 2FA via Supabase Auth */
  @Column({ default: false })
  isTwoFactorEnabled: boolean;

  // ── Guest flow ────────────────────────────────────────────────────────────

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column({ default: false })
  hasCompletedOrder: boolean;

  @Column({ nullable: true })
  registrationInvitedAt?: Date;

  @Column({ nullable: true })
  convertedToCustomerAt?: Date;

  // ── Cart merge tracking ───────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  @Index()
  mergedToUserId?: string;

  @Column({ type: 'uuid', nullable: true })
  guestUserId?: string;

  @Column({ type: 'timestamp', nullable: true })
  mergedAt?: Date;

  // ── Stripe ────────────────────────────────────────────────────────────────

  @Column({ nullable: true })
  @Index()
  stripeCustomerId?: string;

  @Column({ nullable: true })
  @Index()
  defaultPaymentMethodId?: string;

  // ── Stats ──────────────────────────────────────────────────────────────────

  @Column({ default: 0 })
  totalOrders: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalSpent: number;

  @Column({ nullable: true })
  lastOrderDate?: Date;

  // ── Marketing & Consents ──────────────────────────────────────────────────

  @Column({ default: true })
  marketingConsent: boolean;

  @OneToOne(() => Consent, consent => consent.user, { cascade: true })
  consents?: Consent;

  // ── Relations ─────────────────────────────────────────────────────────────

  @OneToMany(() => Address, a => a.user)
  addresses: Address[];

  @OneToMany(() => Review, r => r.user)
  reviews: Review[];

  @OneToMany(() => Order, o => o.user)
  orders: Order[];

  @OneToMany(() => Cart, c => c.user)
  carts: Cart[];

  @OneToMany(() => Wishlist, w => w.user)
  wishlist: Wishlist[];

  // ── Timestamps ─────────────────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  @Column({ default: 'it' })
  preferredLanguage: string;

  // ── Helpers ───────────────────────────────────────────────────────────────

  get isGuest(): boolean {
    return this.role === UserRole.GUEST;
  }

  getFullName(): string {
    if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
    return this.email || this.lastCheckoutEmail || '';
  }

  updateOrderStats(orderAmount: number): void {
    this.totalOrders += 1;
    const current = typeof this.totalSpent === 'string' ? parseFloat(this.totalSpent) || 0 : this.totalSpent || 0;
    const amount = typeof orderAmount === 'string' ? parseFloat(orderAmount) || 0 : orderAmount || 0;
    this.totalSpent = current + amount;
    this.lastOrderDate = new Date();
    if (!this.hasCompletedOrder) this.hasCompletedOrder = true;
  }

  shouldInviteToRegister(): boolean {
    if (!this.isGuest || this.totalOrders < 2) return false;
    if (this.registrationInvitedAt) {
      const days = (Date.now() - this.registrationInvitedAt.getTime()) / 86_400_000;
      return days > 30;
    }
    return true;
  }

  /**
   * Promuove il guest a customer dopo che l'utente si è registrato via Supabase.
   * La password è gestita interamente da Supabase Auth.
   */
  convertToCustomer(supabaseId: string): void {
    if (!this.isGuest) throw new Error('User is already a customer');
    this.role = UserRole.CUSTOMER;
    this.supabaseId = supabaseId;
    this.expiresAt = null;
    this.convertedToCustomerAt = new Date();
  }

  isExpired(): boolean {
    if (!this.isGuest || !this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  extendExpiry(days = 90): void {
    if (!this.isGuest) return;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    this.expiresAt = expiry;
  }

  isFrequentCustomer(): boolean {
    return this.totalOrders >= 3 || this.totalSpent >= 100;
  }

  normalizeNumericFields(): void {
    if (typeof this.totalSpent === 'string') this.totalSpent = parseFloat(this.totalSpent) || 0;
    this.totalSpent = Math.round((this.totalSpent + Number.EPSILON) * 100) / 100;
  }

  markAsMerged(customerUserId: string): void {
    if (!this.isGuest) throw new Error('Solo guest users possono essere merged');
    this.mergedToUserId = customerUserId;
    this.mergedAt = new Date();
    this.email = `merged_${this.id}@guest.local`;
  }

  isMerged(): boolean { return !!this.mergedToUserId; }
  canBeDeleted(): boolean { return this.isGuest && this.totalOrders === 0 && !this.mergedToUserId; }
  isDeleted(): boolean { return !!this.deletedAt; }
}
