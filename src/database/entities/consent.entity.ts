import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('consents')
export class Consent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @OneToOne(() => User, user => user.consents)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: false })
  termsAccepted: boolean;

  @Column({ default: false })
  privacyAccepted: boolean;

  @Column({ default: false })
  marketingConsent: boolean;

  @CreateDateColumn()
  consentDate: Date;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string; // Utile per registrare da quale browser/dispositivo è stato dato il consenso
}
