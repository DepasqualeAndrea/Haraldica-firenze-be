import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, Index
} from 'typeorm';
import { User } from './user.entity';
import { IsString, Matches } from 'class-validator';

@Entity('addresses')
@Index(['userId'])
@Index(['type'])
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.addresses, {
    nullable: true,
    onDelete: 'CASCADE'
  })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  name: string;

  @Column()
  street: string;

  @Column()
  city: string;

  @Column()
  postalCode: string;

  @Column()
  country: string;

  @Column({ default: '' })
  province: string;

  @Column({ default: '' })
  provinceCode: string;

  @Column({ nullable: true })
  @IsString()
  @Matches(/^(\+39)?\s?\d{9,10}$/, {
    message: 'Numero di telefono non valido (es. +393334567890)',
  })
  phone?: string;


  @Column({ nullable: true })
  company?: string;

  @Column({ nullable: true })
  vatNumber?: string;

  @Column({ default: true })
  isDefault: boolean;

  @Column({ default: 'shipping' })
  type: 'shipping' | 'billing';

  @Column({ nullable: true })
  notes?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt: Date;

  @Column({ default: 1 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  

  // ===========================
  // 🛠️ HELPER METHODS
  // ===========================

  /**
   * Verifica se l'indirizzo appartiene a un guest
   */
  isGuestAddress(): boolean {
    return this.user?.isGuest || false;
  }

  /**
   * Verifica se l'indirizzo appartiene a un utente registrato
   */
  isUserAddress(): boolean {
    return !this.isGuestAddress() && !!this.userId;
  }

  /**
   * Ottieni il proprietario dell'indirizzo
   */
  getOwner(): User | null {
    return this.user || null;
  }

  /**
   * Ottieni l'email del proprietario
   */
  getOwnerEmail(): string | null {
    return this.user?.email || null;
  }

  /**
   * Formatta indirizzo per display
   */
  getFormattedAddress(): string {
    return `${this.street}, ${this.city} ${this.postalCode}, ${this.province}, ${this.country}`;
  }

  /**
   * Verifica se l'indirizzo è valido per spedizione
   */
  isValidForShipping(): boolean {
    return !!(
      this.name &&
      this.street &&
      this.city &&
      this.postalCode &&
      this.country &&
      this.province
    );
  }

  /**
   * Aggiorna statistiche utilizzo
   */
  markAsUsed(): void {
    this.lastUsedAt = new Date();
    this.usageCount += 1;
  }

  /**
   * Converte indirizzo in formato per ordini (per compatibilità)
   */
  toOrderAddressFormat(): {
    name: string;
    street: string;
    city: string;
    province: string;
    provinceCode: string;
    postalCode: string;
    country: string;
    phone?: string;
    company?: string;
    vatNumber?: string;
  } {
    return {
      name: this.name,
      street: this.street,
      city: this.city,
      postalCode: this.postalCode,
      country: this.country,
      province: this.province,
      provinceCode: this.provinceCode,
      phone: this.phone,
      company: this.company,
      vatNumber: this.vatNumber,
    };
  }

  /**
   * Crea da formato ordine esistente (per migrazione)
   */
  static fromOrderAddress(
    orderAddress: any,
    userId: string,
    type: 'shipping' | 'billing' = 'shipping'
  ): Partial<Address> {
    return {
      userId,
      name: orderAddress.name,
      street: orderAddress.street,
      city: orderAddress.city,
      postalCode: orderAddress.postalCode,
      country: orderAddress.country,
      province: orderAddress.province || orderAddress.province,
      provinceCode: orderAddress.provinceCode || orderAddress.provinceCode,
      phone: orderAddress.phone,
      company: orderAddress.company,
      vatNumber: orderAddress.vatNumber,
      type,
      isDefault: false,
    };
  }

  /**
   * Verifica se due indirizzi sono equivalenti
   */
  isSameAs(otherAddress: Address | any): boolean {
    return (
      this.street === otherAddress.street &&
      this.city === otherAddress.city &&
      this.province === otherAddress.province &&
      this.postalCode === otherAddress.postalCode &&
      this.country === otherAddress.country &&
      this.name === otherAddress.name
    );
  }
}