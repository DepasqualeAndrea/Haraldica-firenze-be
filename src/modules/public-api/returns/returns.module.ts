import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { Product } from 'src/database/entities/product.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { ReturnItem } from 'src/database/entities/return-item.entity';
import { Return } from 'src/database/entities/return.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return,
      ReturnItem,
      Order,
      OrderItem,
      Product,
      ProductVariant,
    ]),
    NotificationsModule,
    PaymentsModule,
    FileUploadModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}