import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon } from 'src/database/entities/coupon.entity';
import { Order } from 'src/database/entities/order.entity';
import { CouponsAdminService } from './coupons.service';
import { CouponsAdminController } from './coupons.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, Order])],
  providers: [CouponsAdminService],
  controllers: [CouponsAdminController],
  exports: [CouponsAdminService],
})
export class CouponsAdminModule {}
