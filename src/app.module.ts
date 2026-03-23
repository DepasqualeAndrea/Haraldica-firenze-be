import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import appConfig from './config';
import { databaseConfig } from './config/database.config';
import { configValidationSchema } from './config';

import emailConfig from './config/email.config';
import stripeConfig from './config/stripe.config';
import jwtConfig from './config/jwt.config';
import { ProductsPublicModule } from './modules/public-api/products/products-public.module';
import { FlexibleAuthGuard } from './common/guards/flexible-auth.guard';
import { RedisModule } from './common/redis/redis.module';
import queueConfig from './config/queue.config';
import redisConfig from './config/redis.config';
import { AddressesModule } from './modules/public-api/addresses/addresses.module';
import { AuthModule } from './modules/public-api/auth/auth.module';
import { ConsentsModule } from './modules/public-api/auth/consent/consent.module';
import { GuestTokenService } from './modules/public-api/auth/guest-token.service';
import { CartModule } from './modules/public-api/cart/cart.module';
import { CronModule } from './modules/public-api/cron/cron.module';
import { FileUploadModule } from './modules/public-api/file-upload/file-upload.module';
import { NotificationsModule } from './modules/public-api/notifications/notifications.module';
import { OrdersEventsModule } from './modules/public-api/orders/orders-events.module';
import { OrdersModule } from './modules/public-api/orders/orders.module';
import { PaymentsModule } from './modules/public-api/payments/payments.module';
import { QueueModule } from './modules/public-api/queue/queue.module';
import { ReviewsModule } from './modules/public-api/reviews/reviews.module';
import { UsersModule } from './modules/public-api/users/users.module';
import { InventoryModule } from './modules/admin-api/inventory/inventory.module';
import { ProductsAdminModule } from './modules/admin-api/products/products-admin.module';
import { CouponsAdminModule } from './modules/admin-api/coupons/coupons.module';
import { CouponsPublicModule } from './modules/public-api/coupons/coupons-public.module';
import { OrdersAdminModule } from './modules/admin-api/orders/orders-admin.module';
import { ReturnsModule } from './modules/public-api/returns/returns.module';
import { ShipmentsModule } from './modules/public-api/brt/shipments/shipments.module';
import { BrtModule } from './modules/public-api/brt/brt.module';
import { HealthModule } from './modules/health/health.module';
import { UtilsModule } from './modules/public-api/utils/utils.module';
import { ReportsModule } from './modules/admin-api/reports/reports.module';
import { DashboardModule } from './modules/admin-api/dashboard/dashboard.module';
import { WishlistsModule } from './modules/public-api/wishlists/wishlists.module';
import { NewsletterModule } from './modules/admin-api/newsletter/newsletter.module';
import { AuditLogModule } from './common/audit/audit-log.module';

@Module({
  imports: [
    // ============= CONFIGURATION =============
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        stripeConfig,
        redisConfig,
        queueConfig,
        jwtConfig,
        emailConfig,
      ],
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      cache: true, // Cache delle configurazioni per performance
    }),

    // ============= DATABASE =============
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        if (!dbConfig) {
          throw new Error('❌ Database configuration is missing');
        }
        return dbConfig;
      },
      inject: [ConfigService],
    }),

    // ============= STATIC FILES (UPLOADS) =============
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        index: false,
        fallthrough: true,
      },
    }),

    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // ============= RATE LIMITING =============
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: parseInt(configService.get('RATE_LIMIT_WINDOW_MS', '900000')),
            limit: parseInt(configService.get('RATE_LIMIT_MAX_REQUESTS', '100')),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // ============= TASK SCHEDULING =============
    ScheduleModule.forRoot(),

    // ============= EVENT SYSTEM =============
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // ============= QUEUE SYSTEM =============
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get('REDIS_PORT', '6379')),
          password: configService.get('REDIS_PASSWORD'),
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),

    // ============= AUTHENTICATION =============
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const jwtConfig = configService.get('jwt');
        return {
          secret: jwtConfig.secret,
          signOptions: {
            expiresIn: jwtConfig.expiresIn,
            issuer: jwtConfig.issuer,
            audience: jwtConfig.audience,
          },
        };
      },
      inject: [ConfigService],
    }),
    QueueModule,
    RedisModule, // ✅ Redis client globale per blacklist e cache
    // ============= CORE BUSINESS MODULES =============
    AuthModule,
    UsersModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ConsentsModule,
    OrdersEventsModule,
    CronModule,
    ProductsPublicModule,
    ProductsAdminModule,
    CouponsAdminModule,
    CouponsPublicModule,
    OrdersAdminModule,
    OrdersEventsModule,
    ShipmentsModule,
    BrtModule,
    // ============= EXTENDED FUNCTIONALITY =============
    AddressesModule,
    ReviewsModule,
    NotificationsModule,
    FileUploadModule,
    InventoryModule,
    ReturnsModule,
    WishlistsModule,
    UtilsModule,
    // ============= ADMIN REPORTS =============
    ReportsModule,
    DashboardModule,
    NewsletterModule,
    // ============= SECURITY & AUDIT =============
    AuditLogModule,
    // ============= MONITORING =============
    HealthModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FlexibleAuthGuard,
    },
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    this.validateCriticalConfigs();
  }

  private validateCriticalConfigs(): void {
    // Verifica che ci sia DATABASE_URL oppure le credenziali separate
    const hasDbUrl = !!this.configService.get('DATABASE_URL');
    const hasDbCredentials =
      !!this.configService.get('DB_HOST') &&
      !!this.configService.get('DB_USERNAME') &&
      !!this.configService.get('DB_PASSWORD');

    if (!hasDbUrl && !hasDbCredentials) {
      throw new Error(
        '❌ Configurazione database mancante: fornire DATABASE_URL oppure DB_HOST + DB_USERNAME + DB_PASSWORD'
      );
    }

    const criticalConfigs = [
      'JWT_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ];

    const missingConfigs = criticalConfigs.filter(
      config => !this.configService.get(config)
    );

    if (missingConfigs.length > 0) {
      throw new Error(
        `❌ Configurazioni critiche mancanti: ${missingConfigs.join(', ')}`
      );
    }

    // Validazione formato JWT_SECRET
    const jwtSecret = this.configService.get('JWT_SECRET');
    if (jwtSecret && jwtSecret.length < 32) {
      throw new Error('❌ JWT_SECRET deve essere di almeno 32 caratteri');
    }

    // Validazione formato Stripe keys
    const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
    if (stripeSecretKey && !stripeSecretKey.startsWith('sk_')) {
      throw new Error('❌ STRIPE_SECRET_KEY formato invalido');
    }

    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
      throw new Error('❌ STRIPE_WEBHOOK_SECRET formato invalido');
    }

    console.log('✅ Tutte le configurazioni critiche sono valide');
  }
}