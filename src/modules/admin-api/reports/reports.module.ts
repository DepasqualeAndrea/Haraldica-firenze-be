import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Order } from 'src/database/entities/order.entity';
import { Payment } from 'src/database/entities/payment.entity';
import { OrderItem } from 'src/database/entities/order-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment, OrderItem]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
