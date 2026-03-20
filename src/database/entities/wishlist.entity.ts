import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, CreateDateColumn } from "typeorm";
import { Product } from "./product.entity";
import { User } from "./user.entity";

@Entity('wishlists')
export class Wishlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Product)
  product: Product;

  @Column()
  productId: string;

  @CreateDateColumn()
  createdAt: Date;
}