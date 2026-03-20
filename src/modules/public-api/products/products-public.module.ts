import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from 'src/database/entities/product.entity';
import { Category } from 'src/database/entities/category.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsPublicController } from './products-public.controller';
import { InventoryModule } from 'src/modules/admin-api/inventory/inventory.module';
import { ProductsPublicService } from './products-public.service';
import { CategoriesModule } from 'src/modules/admin-api/categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Category, ProductVariant]),
    forwardRef(() => CartModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => CategoriesModule),
    forwardRef(() => InventoryModule),
  ],
  providers: [ProductsPublicService],
  controllers: [ProductsPublicController],
  exports: [ProductsPublicService],
})
export class ProductsPublicModule { }