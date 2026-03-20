import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import Stripe from 'stripe';
import { RedisService } from '../../common/redis/redis.service';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
    stripe: CheckStatus;
  };
  timestamp: string;
}

export interface CheckStatus {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
  details?: any;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly checkTimeout = 5000; // 5 secondi max per check
  private readonly stripeClient: Stripe;
  private readonly redisClient: Redis;

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.redisClient = this.redisService.getClient();
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripeClient = new Stripe(stripeKey, {
        apiVersion: '2025-08-27.basil',
      });
    }
  }

  /**
   * ✅ Readiness probe: verifica tutte le dipendenze critiche
   * Usato da Kubernetes/ECS per determinare se instanza può ricevere traffic
   */
  async checkReadiness(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStripe(),
    ]);

    const [database, redis, stripe] = checks;

    const allUp = database.status === 'up' && redis.status === 'up' && stripe.status === 'up';
    const someDown = database.status === 'down' || redis.status === 'down';

    const overallStatus: 'ok' | 'degraded' | 'down' =
      allUp ? 'ok' :
      someDown ? 'down' :
      'degraded';

    const result: HealthCheckResult = {
      status: overallStatus,
      checks: { database, redis, stripe },
      timestamp: new Date().toISOString(),
    };

    // ❌ Se critical check fallisce, lancia errore 503
    if (overallStatus === 'down') {
      this.logger.error('❌ Readiness check failed', result);
      throw new ServiceUnavailableException(result);
    }

    if (overallStatus === 'degraded') {
      this.logger.warn('⚠️ Readiness check degraded', result);
    }

    return result;
  }

  /**
   * ✅ Database health check con timeout
   */
  private async checkDatabase(): Promise<CheckStatus> {
    const start = Date.now();
    try {
      await this.runWithTimeout(
        this.dataSource.query('SELECT 1'),
        this.checkTimeout,
        'Database check timeout'
      );

      const responseTime = Date.now() - start;
      this.logger.log(`✅ Database check passed (${responseTime}ms)`);

      return {
        status: 'up',
        responseTime,
        details: {
          isConnected: this.dataSource.isInitialized,
        },
      };
    } catch (error: any) {
      this.logger.error(`❌ Database check failed: ${error.message}`);
      return {
        status: 'down',
        error: error.message,
      };
    }
  }

  /**
   * ✅ Redis health check con timeout
   */
  private async checkRedis(): Promise<CheckStatus> {
    const start = Date.now();
    try {
      await this.runWithTimeout(
        this.redisClient.ping(),
        this.checkTimeout,
        'Redis check timeout'
      );

      const responseTime = Date.now() - start;
      this.logger.log(`✅ Redis check passed (${responseTime}ms)`);

      return {
        status: 'up',
        responseTime,
        details: {
          connected: this.redisClient.status === 'ready',
        },
      };
    } catch (error: any) {
      this.logger.error(`❌ Redis check failed: ${error.message}`);
      return {
        status: 'down',
        error: error.message,
      };
    }
  }

  /**
   * ✅ Stripe API health check con timeout
   */
  private async checkStripe(): Promise<CheckStatus> {
    if (!this.stripeClient) {
      return {
        status: 'down',
        error: 'Stripe client not initialized',
      };
    }

    const start = Date.now();
    try {
      // Lightweight API call per verificare connettività
      await this.runWithTimeout(
        this.stripeClient.balance.retrieve(),
        this.checkTimeout,
        'Stripe check timeout'
      );

      const responseTime = Date.now() - start;
      this.logger.log(`✅ Stripe check passed (${responseTime}ms)`);

      return {
        status: 'up',
        responseTime,
      };
    } catch (error: any) {
      // Stripe non è critico, degrada gracefully
      this.logger.warn(`⚠️ Stripe check failed: ${error.message}`);
      return {
        status: 'down',
        error: error.message,
      };
    }
  }

  /**
   * ✅ Helper: esegue operazione async con timeout
   */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    errorMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeout)
      ),
    ]);
  }
}
