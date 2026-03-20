import { forwardRef, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from 'src/database/entities/product.entity';
import { User } from 'src/database/entities/user.entity';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { ProductsPublicModule } from '../products/products-public.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Product]),
    forwardRef(() => PaymentsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => ProductsPublicModule)
  ],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule { }