import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FlexibleAuthGuard } from "src/common/guards/flexible-auth.guard";
import { CartItem } from "src/database/entities/cart-item.entity";
import { Cart } from "src/database/entities/cart.entity";
import { OrderItem } from "src/database/entities/order-item.entity";
import { Order } from "src/database/entities/order.entity";
import { User } from "src/database/entities/user.entity";
import { ProductVariant } from "src/database/entities/product-variant.entity";
import { InventoryModule } from "src/modules/admin-api/inventory/inventory.module";
import { AddressesModule } from "../addresses/addresses.module";
import { GuestTokenService } from "../auth/guest-token.service";
import { CartModule } from "../cart/cart.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { CheckoutService } from "./checkout.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ProductsPublicModule } from "../products/products-public.module";
import { BrtService } from "../brt/brt.service";
import { BrtModule } from "../brt/brt.module";
import { ShipmentsModule } from "../brt/shipments/shipments.module";
import { AuthModule } from "../auth/auth.module";
import { DuplicateOrderGuard } from "src/common/security/duplicate-order.guard";
import { RedisModule } from "src/common/redis/redis.module";
import { CouponsAdminModule } from "src/modules/admin-api/coupons/coupons.module";


@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, User, Cart, CartItem, ProductVariant]),
    ConfigModule,
    RedisModule,
    InventoryModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => AddressesModule),
    forwardRef(() => CartModule),
    forwardRef(() => ProductsPublicModule),
    forwardRef(() => BrtModule),
    forwardRef(() => ShipmentsModule),
    forwardRef(() => AuthModule),
    CouponsAdminModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): JwtModuleOptions => ({
        secret: cfg.get<string>('JWT_SECRET') || 'dev_secret',
        signOptions: { expiresIn: (cfg.get<string>('JWT_EXPIRES_IN') || '24h') as any },
      }),
    }),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    CheckoutService,
    FlexibleAuthGuard,
    GuestTokenService,
    DuplicateOrderGuard,
  ],
  exports: [OrdersService, CheckoutService, GuestTokenService],
})
export class OrdersModule { }