import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersModule } from 'src/modules/public-api/orders/orders.module';
import { Order } from 'src/database/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    OrdersModule,
  ],
  controllers: [OrdersAdminController],
})
export class OrdersAdminModule {}
//   exports: [OrdersService, CheckoutService, GuestTokenService],
// })
// export class OrdersModule {}