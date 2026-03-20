import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

/**
 * ✅ FIX CRITICO: Redis-based blacklist per ambiente distribuito
 * Token invalidati dopo logout con TTL automatico
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'blacklist:token:';

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.redis = this.redisService.getClient();
  }

  /**
   * Aggiunge token alla blacklist con TTL automatico
   */
  async add(token: string, expSeconds: number): Promise<void> {
    try {
      const key = this.getKey(token);
      // Usa SET con EX per TTL automatico
      await this.redis.set(key, '1', 'EX', expSeconds);
      this.logger.debug(`Token blacklisted: ${token.substring(0, 20)}... (TTL: ${expSeconds}s)`);
    } catch (error) {
      this.logger.error(`❌ Errore aggiunta token alla blacklist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica se token è nella blacklist
   */
  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const key = this.getKey(token);
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(`❌ Errore verifica blacklist: ${error.message}`);
      // In produzione, fail-secure: se Redis non risponde, blocca l'accesso
      const isProduction =
        this.configService.get('app.environment') === 'production' ||
        this.configService.get('NODE_ENV') === 'production';
      if (isProduction) {
        this.logger.error('❌ Redis unavailable: deny access (fail-secure)');
        return true;
      }
      // In dev/test manteniamo fail-open per evitare blocchi durante sviluppo
      return false;
    }
  }

  /**
   * Rimuove token dalla blacklist (opzionale, normalmente scade da solo)
   */
  async remove(token: string): Promise<void> {
    try {
      const key = this.getKey(token);
      await this.redis.del(key);
      this.logger.debug(`Token rimosso dalla blacklist: ${token.substring(0, 20)}...`);
    } catch (error) {
      this.logger.error(`❌ Errore rimozione token dalla blacklist: ${error.message}`);
    }
  }

  /**
   * Ottiene statistiche blacklist
   */
  async getStats(): Promise<{ totalBlacklisted: number }> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      return {
        totalBlacklisted: keys.length,
      };
    } catch (error) {
      this.logger.error(`❌ Errore stats blacklist: ${error.message}`);
      return { totalBlacklisted: 0 };
    }
  }

  private getKey(token: string): string {
    return `${this.keyPrefix}${token}`;
  }
}