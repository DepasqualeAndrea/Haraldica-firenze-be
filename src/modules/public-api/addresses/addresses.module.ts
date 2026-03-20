import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesController } from './addresses.controller';
import { AddressService } from './addresses.service';
import { User } from 'src/database/entities/user.entity';
import { Cart } from 'src/database/entities/cart.entity';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Address } from 'src/database/entities/address.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Address, User, Cart, CartItem]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AddressesController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressesModule { }