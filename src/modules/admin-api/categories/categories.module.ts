import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Product } from 'src/database/entities/product.entity';
import { Category } from 'src/database/entities/category.entity';
import { SizeGuide } from 'src/database/entities/size-guide.entity';
import { AuthModule } from 'src/modules/public-api/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Product, SizeGuide]),
    forwardRef(() => AuthModule),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}