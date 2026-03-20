// src/common/redis/redis.service.ts
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  getClient(): Redis {
    return this.redisClient;
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Redis client...');
    await this.redisClient.quit();
  }
}
