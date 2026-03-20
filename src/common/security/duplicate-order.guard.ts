// src/common/security/duplicate-order.guard.ts

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { createHash } from 'crypto';

/**
 * SECURITY FIX: Duplicate Order Prevention
 *
 * Previene la creazione di ordini duplicati usando Redis locks.
 * Protegge da:
 * - Double-click utente
 * - Network timeout + retry
 * - Race conditions
 * - Bot attacks
 */
@Injectable()
export class DuplicateOrderGuard {
  private readonly logger = new Logger(DuplicateOrderGuard.name);

  // TTL per il lock (5 minuti)
  private readonly LOCK_TTL_SECONDS = 300;

  // Prefix Redis per i locks
  private readonly LOCK_PREFIX = 'order:lock:';

  constructor(private readonly redis: RedisService) {}

  /**
   * Genera una chiave unica per identificare un checkout
   * Basata su: userId + cartHash + totale + timestamp (arrotondato a 5 min)
   */
  generateCheckoutKey(
    userId: string,
    cartHash: string,
    total: number,
  ): string {
    // Arrotonda timestamp a finestre di 5 minuti per catturare retry rapidi
    const timeWindow = Math.floor(Date.now() / (5 * 60 * 1000));

    const payload = `${userId}:${cartHash}:${total.toFixed(2)}:${timeWindow}`;
    return createHash('sha256').update(payload).digest('hex').substring(0, 32);
  }

  /**
   * Tenta di acquisire un lock per il checkout
   *
   * @returns { acquired: boolean, existingOrderId?: string }
   */
  async acquireLock(
    checkoutKey: string,
    orderId: string,
  ): Promise<{ acquired: boolean; existingOrderId?: string }> {
    const lockKey = `${this.LOCK_PREFIX}${checkoutKey}`;

    try {
      // SET NX (solo se non esiste) con TTL
      const result = await this.redis.getClient().set(
        lockKey,
        orderId,
        'EX',
        this.LOCK_TTL_SECONDS,
        'NX',
      );

      if (result === 'OK') {
        this.logger.log(`🔒 Lock acquisito: ${checkoutKey} -> ${orderId}`);
        return { acquired: true };
      }

      // Lock già presente - recupera orderId esistente
      const existingOrderId = await this.redis.getClient().get(lockKey);

      this.logger.warn(
        `⚠️ Duplicate checkout bloccato: ${checkoutKey} ` +
        `(ordine esistente: ${existingOrderId})`,
      );

      return { acquired: false, existingOrderId: existingOrderId || undefined };

    } catch (error) {
      this.logger.error(`❌ Errore acquire lock: ${error.message}`);
      // In caso di errore Redis, permetti il checkout (fail-open)
      // per non bloccare il business
      return { acquired: true };
    }
  }

  /**
   * Rilascia il lock dopo checkout completato
   */
  async releaseLock(checkoutKey: string): Promise<void> {
    const lockKey = `${this.LOCK_PREFIX}${checkoutKey}`;

    try {
      await this.redis.getClient().del(lockKey);
      this.logger.log(`🔓 Lock rilasciato: ${checkoutKey}`);
    } catch (error) {
      this.logger.error(`❌ Errore release lock: ${error.message}`);
    }
  }

  /**
   * Aggiorna il lock con l'orderId reale (sovrascrive il valore)
   */
  async updateLock(checkoutKey: string, orderId: string): Promise<void> {
    const lockKey = `${this.LOCK_PREFIX}${checkoutKey}`;

    try {
      await this.redis.getClient().set(
        lockKey,
        orderId,
        'EX',
        this.LOCK_TTL_SECONDS,
      );
      this.logger.log(`🔁 Lock aggiornato: ${checkoutKey} -> ${orderId}`);
    } catch (error) {
      this.logger.error(`❌ Errore update lock: ${error.message}`);
    }
  }
  /**
   * Verifica se un checkout è già in corso
   */
  async isCheckoutInProgress(checkoutKey: string): Promise<{
    inProgress: boolean;
    existingOrderId?: string;
  }> {
    const lockKey = `${this.LOCK_PREFIX}${checkoutKey}`;

    try {
      const existingOrderId = await this.redis.getClient().get(lockKey);

      if (existingOrderId) {
        return { inProgress: true, existingOrderId };
      }

      return { inProgress: false };
    } catch (error) {
      this.logger.error(`❌ Errore check lock: ${error.message}`);
      return { inProgress: false };
    }
  }

  /**
   * Estende il TTL di un lock esistente
   */
  async extendLock(checkoutKey: string, additionalSeconds: number = 300): Promise<boolean> {
    const lockKey = `${this.LOCK_PREFIX}${checkoutKey}`;

    try {
      const result = await this.redis.getClient().expire(lockKey, additionalSeconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`❌ Errore extend lock: ${error.message}`);
      return false;
    }
  }
}
