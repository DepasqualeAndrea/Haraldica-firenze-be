import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { Product } from 'src/database/entities/product.entity';
import { Review } from 'src/database/entities/review.entity';
import { User } from 'src/database/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Product, User, Order, OrderItem]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}