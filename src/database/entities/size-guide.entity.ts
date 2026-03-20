// src/database/entities/size-guide.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Category } from './category.entity';

export enum SizeSystem {
  EU = 'eu',
  IT = 'it',
  UK = 'uk',
  US = 'us',
  UNIVERSAL = 'universal', // S / M / L / XL
}

export interface SizeRow {
  label: string;          // "S", "IT 48", "EU 42"
  eu?: string;
  it?: string;
  uk?: string;
  us?: string;
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  shoulderCm?: number;
  lengthCm?: number;
  footLengthCm?: number;  // for shoes
}

@Entity('size_guides')
export class SizeGuide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ length: 120 })
  title: string;          // "Guida taglie camicie", "Guida taglie scarpe"

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  rows: SizeRow[];

  @Column({
    type: 'enum',
    enum: SizeSystem,
    default: SizeSystem.EU,
  })
  primarySystem: SizeSystem;

  @Column({ nullable: true })
  notes?: string;         // "Le taglie IT corrispondono al girovita in cm"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
