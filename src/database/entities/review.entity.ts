import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';
import { Order } from './order.entity';

@Entity('reviews')
@Index(['productId', 'userId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.reviews)
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Product, product => product.reviews)
  product: Product;

  @Column()
  productId: string;

  @ManyToOne(() => Order, order => order.reviews, { nullable: true })
  order: Order;

  @Column({ nullable: true })
  orderId: string;

  @Column('numeric', { precision: 2, scale: 1 })
  rating: number;

  @Column()
  title: string;

  @Column('text')
  comment: string;

  @Column('jsonb', { nullable: true })
  images: string[];

  @Column({ default: true })
  isVerifiedPurchase: boolean;

  @Column({ default: false })
  isApproved: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  @Column('text', { nullable: true })
  storeResponse: string;

  @Column({ nullable: true })
  storeResponseDate: Date;

  @Column({ default: 0 })
  helpfulVotes: number;

  @Column({ default: 0 })
  totalVotes: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}