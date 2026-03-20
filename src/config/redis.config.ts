import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '', 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '', 10) || 0,
  keyPrefix: 'haraldicafirenze:',
  
  // Connection options
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  
  // Bull Queue specific config
  bull: {
    host: process.env.BULL_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.BULL_REDIS_PORT ?? '', 10) || parseInt(process.env.REDIS_PORT ?? '', 10) || 6379,
    password: process.env.BULL_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.BULL_REDIS_DB ?? '', 10) || 1,
  },
}));