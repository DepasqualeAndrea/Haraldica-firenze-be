import { Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column({ nullable: true })
  preferredFit?: string; // slim, regular, relaxed, oversized

  @Column({ nullable: true })
  style?: string; // classic, casual, formal, sport

  @Column('json', { nullable: true })
  preferredSizes?: string[]; // ['M', 'L', '42', etc.]

  @Column('json', { nullable: true })
  preferredColors?: string[];

  @Column('json', { nullable: true })
  favoriteCategories?: string[];

  @Column({ nullable: true })
  preferredBrands?: string;

  @Column({ default: false })
  emailNewsletterOptIn: boolean;

  @Column({ default: false })
  smsMarketingOptIn: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
