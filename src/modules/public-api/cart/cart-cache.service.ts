import { Injectable, Logger } from '@nestjs/common';
import { User } from 'src/database/entities/user.entity';

interface CachedUser {
  user: User;
  timestamp: number;
}

@Injectable()
export class CartCacheService {
  private readonly logger = new Logger(CartCacheService.name);
  private readonly userCache = new Map<string, CachedUser>();
  private readonly CACHE_TTL = 60000; // 1 minuto

  getCachedUser(identifier: string, type: 'guest' | 'customer'): User | null {
    const key = `${type}:${identifier}`;
    const cached = this.userCache.get(key);

    if (!cached) return null;

    // Verifica scadenza
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.userCache.delete(key);
      return null;
    }

    return cached.user;
  }

  setCachedUser(identifier: string, type: 'guest' | 'customer', user: User): void {
    const key = `${type}:${identifier}`;
    this.userCache.set(key, {
      user,
      timestamp: Date.now(),
    });

    // Auto-cleanup ogni 5 minuti
    if (this.userCache.size > 1000) {
      this.cleanup();
    }
  }

  invalidate(identifier: string, type: 'guest' | 'customer'): void {
    const key = `${type}:${identifier}`;
    this.userCache.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.userCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.userCache.delete(key);
        cleaned++;
      }
    }

    this.logger.debug(`🧹 Cache cleanup: rimossi ${cleaned} entries`);
  }
}