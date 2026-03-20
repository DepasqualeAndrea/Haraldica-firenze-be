import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockReservation } from 'src/database/entities/stock-reservation.entity';
import { InventoryMovement } from 'src/database/entities/inventory-movement.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { User } from 'src/database/entities/user.entity';
import { NotificationsModule } from 'src/modules/public-api/notifications/notifications.module';
import { AuthModule } from 'src/modules/public-api/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryMovement, ProductVariant, User, StockReservation]),
    forwardRef(() => NotificationsModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}