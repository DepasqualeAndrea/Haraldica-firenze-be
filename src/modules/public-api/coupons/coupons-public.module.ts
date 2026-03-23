import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsAdminModule } from 'src/modules/admin-api/coupons/coupons.module';
import { Order } from 'src/database/entities/order.entity';
import { CouponsPublicController } from './coupons-public.controller';
import { CouponsPublicService } from './coupons-public.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    CouponsAdminModule,
  ],
  controllers: [CouponsPublicController],
  providers: [CouponsPublicService],
})
export class CouponsPublicModule {}
