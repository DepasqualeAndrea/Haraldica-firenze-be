// src/modules/users/users.module.ts

import { forwardRef, Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { User } from 'src/database/entities/user.entity';

// Controller & Service
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// External Modules
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { CartModule } from '../cart/cart.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Address } from 'src/database/entities/address.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Address]),
    forwardRef(() => OrdersModule),
    forwardRef(() => CartModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}