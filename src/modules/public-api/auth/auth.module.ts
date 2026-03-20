import { Module, forwardRef } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { UsersModule } from '../users/users.module';
import { ConsentsModule } from './consent/consent.module';
import { GuestTokenService } from './guest-token.service';
import { FlexibleAuthGuard } from 'src/common/guards/flexible-auth.guard';
import { TokenBlacklistService } from 'src/common/security/token-blacklist.service';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consent } from 'src/database/entities/consent.entity';
import { Order } from 'src/database/entities/order.entity';
import { User } from 'src/database/entities/user.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Consent, Order]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (cfg: ConfigService): Promise<JwtModuleOptions> => {
        const defaultExpiresIn: JwtSignOptions['expiresIn'] = '24h';
        const expiresIn = cfg.get<JwtSignOptions['expiresIn']>('JWT_EXPIRES_IN') ?? defaultExpiresIn;

        return {
          secret: cfg.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn,
            issuer: cfg.get<string>('jwt.issuer'),
            audience: cfg.get<string>('jwt.audience'),
          },
        };
      },
      inject: [ConfigService],
    }),
    forwardRef(() => UsersModule),
    forwardRef(() => ConsentsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GuestTokenService,
    TokenBlacklistService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    GuestTokenService,
    TokenBlacklistService,
    JwtAuthGuard,
    RolesGuard,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule { }