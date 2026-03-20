// src/modules/public-api/wishlists/wishlists.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Wishlist } from 'src/database/entities/wishlist.entity';
import { Product } from 'src/database/entities/product.entity';

// Service & Controller
import { WishlistsService } from './wishlists.service';
import { WishlistsController } from './wishlists.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wishlist, Product]),
  ],
  controllers: [WishlistsController],
  providers: [WishlistsService],
  exports: [WishlistsService],
})
export class WishlistsModule {}
