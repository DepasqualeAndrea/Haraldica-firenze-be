// src/modules/public-api/payments/payments.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { WebhookController } from './webhooks.controller';
import { WebhookService } from './webhooks.service';
import { WebhookEventService } from './webhook-event.service';
import { CartModule } from '../cart/cart.module';
import { Cart } from 'src/database/entities/cart.entity';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Coupon } from 'src/database/entities/coupon.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { Payment } from 'src/database/entities/payment.entity';
import { Order } from 'src/database/entities/order.entity';
import { User } from 'src/database/entities/user.entity';
import { StripeWebhookEvent } from 'src/database/entities/stripe-webhook-event.entity';
import { InventoryModule } from 'src/modules/admin-api/inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { ProductsPublicModule } from '../products/products-public.module';
import { ShipmentsModule } from '../brt/shipments/shipments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, User, Cart, CartItem, Coupon, StripeWebhookEvent]),
    forwardRef(() => ShipmentsModule),
    forwardRef(() => ProductsPublicModule),
    forwardRef(() => CartModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [PaymentsController, WebhookController],
  providers: [
    PaymentsService,
    StripeService,
    WebhookService,
    WebhookEventService,
  ],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule { }