import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueNames } from './enums/queue-names.enum';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        redis: {
          host: cfg.get<string>('BULL_REDIS_HOST') || cfg.get<string>('REDIS_HOST'),
          port: Number(cfg.get<string>('BULL_REDIS_PORT') || cfg.get<string>('REDIS_PORT') || 6379),
          password: cfg.get<string>('BULL_REDIS_PASSWORD') || cfg.get<string>('REDIS_PASSWORD'),
          db: Number(cfg.get<string>('BULL_REDIS_DB') || cfg.get<string>('REDIS_DB') || 0),
        },
        defaultJobOptions: {
          attempts: Number(cfg.get<string>('QUEUE_DEFAULT_JOB_ATTEMPTS') || 3),
          backoff: { type: 'exponential', delay: Number(cfg.get<string>('QUEUE_DEFAULT_BACKOFF_DELAY') || 5000) },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QueueNames.SHIPMENT },
      { name: QueueNames.EMAIL },
      { name: QueueNames.TRACKING },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}