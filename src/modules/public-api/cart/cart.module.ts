// src/modules/public-api/cart/cart.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Cart } from 'src/database/entities/cart.entity';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Product } from 'src/database/entities/product.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { User } from 'src/database/entities/user.entity';

// Services
import { CartService } from './cart.service';
import { CartCacheService } from './cart-cache.service';

// Controller
import { CartController } from './cart.controller';

// External Modules
import { AuthModule } from '../auth/auth.module';
import { ProductsPublicModule } from '../products/products-public.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Product, ProductVariant, User]),
    forwardRef(() => ProductsPublicModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [CartController],
  providers: [CartService, CartCacheService],
  exports: [CartService],
})
export class CartModule {}