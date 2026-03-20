import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Product } from 'src/database/entities/product.entity';
import { Category } from 'src/database/entities/category.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';

// Services
import { ProductsAdminService } from './products-admin.service';

// Modules esterni
import { CategoriesModule } from '../categories/categories.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from 'src/modules/public-api/payments/payments.module';
import { AuthModule } from 'src/modules/public-api/auth/auth.module';

// Controller
import { ProductsAdminController } from './products-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Category, ProductVariant]),
    forwardRef(() => CategoriesModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => AuthModule),
  ],
  providers: [ProductsAdminService],
  controllers: [ProductsAdminController],
  exports: [ProductsAdminService],
})
export class ProductsAdminModule {}