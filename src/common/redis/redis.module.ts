import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisConfig = configService.get('redis');

        const client = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          keyPrefix: redisConfig.keyPrefix,
          retryStrategy: redisConfig.retryStrategy,
          maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
          enableReadyCheck: redisConfig.enableReadyCheck,
          enableOfflineQueue: redisConfig.enableOfflineQueue,
          connectTimeout: redisConfig.connectTimeout,
          lazyConnect: false,
        });

        client.on('connect', () => {
          console.log('✅ Redis connected successfully');
        });

        client.on('error', () => {
          // Silently ignore Redis errors in development
          // Redis is optional and not required for the app to work
        });

        client.on('ready', () => {
          console.log('✅ Redis client ready');
        });

        return client;
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
