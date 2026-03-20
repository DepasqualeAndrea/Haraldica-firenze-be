import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { Order } from 'src/database/entities/order.entity';
import { StockReservation } from 'src/database/entities/stock-reservation.entity';
import { Product } from 'src/database/entities/product.entity';
import { Cart } from 'src/database/entities/cart.entity';
import { User } from 'src/database/entities/user.entity';
import { Shipment } from 'src/database/entities/shipment.entity';

// Services
import { CronService } from './cron.service';

// Modules
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryModule } from 'src/modules/admin-api/inventory/inventory.module';
import { ShipmentsModule } from '../brt/shipments/shipments.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Order,
      StockReservation,
      Product,
      User,
      Cart,
      Shipment,
    ]),
    InventoryModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => ShipmentsModule),
  ],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}