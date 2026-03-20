import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { Payment } from 'src/database/entities/payment.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { User } from 'src/database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, ProductVariant, OrderItem, Payment]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
