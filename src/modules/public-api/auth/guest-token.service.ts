// src/modules/public-api/auth/guest-token.service.ts - FIX

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from 'src/database/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

interface GuestTokenPayload {
  sub: string;
  email: string ;
  role: UserRole;
  type: 'guest';
}

@Injectable()
export class GuestTokenService {
  private readonly logger = new Logger(GuestTokenService.name);

  private creationLocks = new Map<string, Promise<{ token: string; userId: string; expiresIn: string }>>();

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) { }

  async generateGuestToken(userId?: string): Promise<{
    token: string;
    userId: string;
    expiresIn: string;
  }> {
    if (userId) {
      const existingUser = await this.userRepository.findOne({
        where: { id: userId, role: UserRole.GUEST },
      });

      if (existingUser && this.isGuestValid(existingUser)) {
        this.logger.log(`♻️ Riutilizzo guest user esistente: ${userId}`);
        return this.refreshGuestToken(userId);
      }

      this.logger.warn(`⚠️ Guest user ${userId} non trovato o scaduto, creo nuovo`);
    }

    const lockKey = `create_${Math.floor(Date.now() / 1000)}`;

    if (this.creationLocks.has(lockKey)) {
      this.logger.log(`🔒 Creazione guest già in corso (lock: ${lockKey}), attendo completion...`);
      return this.creationLocks.get(lockKey)!;
    }

    const creationPromise = this.createNewGuestUserWithToken();
    this.creationLocks.set(lockKey, creationPromise);

    try {
      const result = await creationPromise;
      return result;
    } finally {
      setTimeout(() => {
        this.creationLocks.delete(lockKey);
        this.logger.debug(`🔓 Lock rimosso: ${lockKey}`);
      }, 2000);
    }
  }

  /**
   * ✅ FIX: Email field usa formato guest_{uuid}@guest.local per garantire unicità
   * CRITICAL: Email deve essere generata PRIMA del primo save per evitare violazione unique constraint
   */
  private async createNewGuestUserWithToken(): Promise<{
    token: string;
    userId: string;
    expiresIn: string;
  }> {
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // ✅ CRITICAL FIX: Genera UUID temporaneo per creare email univoca PRIMA del save
    const tempUuid = uuidv4();
    const tempEmail = `guest_${tempUuid}@guest.local`;

    // ✅ Crea l'utente CON email univoca temporanea
    const guestUser = this.userRepository.create({
      email: tempEmail,
      role: UserRole.GUEST,
      isActive: true,
      expiresAt,
    });

    const saved = await this.userRepository.save(guestUser);

    // ✅ Aggiorna con email basata sull'ID reale generato dal database
    saved.email = `guest_${saved.id}@guest.local`;
    await this.userRepository.save(saved);

    this.logger.log(`👤 Guest user created: ${saved.id} (email: ${saved.email})`);

    const payload: GuestTokenPayload = {
      sub: saved.id,
      email: saved.email,
      role: saved.role,
      type: 'guest',
    };

    const expiresIn = '90d';
    const token = this.jwtService.sign(payload, { expiresIn });

    this.logger.log(`✅ Guest token generated: ${saved.id}`);

    return {
      token,
      userId: saved.id,
      expiresIn,
    };
  }
  async verifyGuestToken(userId: string): Promise<boolean> {
    const guestUser = await this.userRepository.findOne({
      where: { id: userId, role: UserRole.GUEST },
    });

    if (!guestUser) {
      return false;
    }

    return this.isGuestValid(guestUser);
  }

  private isGuestValid(user: User): boolean {
    if (!user.expiresAt) return true;
    return user.expiresAt > new Date();
  }

  validateGuestToken(token: string): GuestTokenPayload | null {
    try {
      const decoded = this.jwtService.verify(token) as GuestTokenPayload;

      if (decoded.type !== 'guest') {
        this.logger.warn('⚠️ Token non è di tipo guest');
        return null;
      }

      return decoded;
    } catch (error) {
      this.logger.warn(`⚠️ Guest token validation failed: ${error.message}`);
      return null;
    }
  }

  async refreshGuestToken(userId: string): Promise<{
    token: string;
    userId: string;
    expiresIn: string;
  }> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId, role: UserRole.GUEST },
    });

    if (!existingUser) {
      this.logger.warn(`⚠️ Guest user ${userId} non trovato per refresh`);
      throw new NotFoundException('Guest user non trovato');
    }

    existingUser.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await this.userRepository.save(existingUser);


    const payload: GuestTokenPayload = {
      sub: existingUser.id,
      email: '',
      role: existingUser.role,
      type: 'guest',
    };

    const expiresIn = '90d';
    const token = this.jwtService.sign(payload, { expiresIn });

    this.logger.log(`♻️ Guest token refreshed: ${existingUser.id}`);

    return {
      token,
      userId: existingUser.id,
      expiresIn,
    };
  }

  async cleanupExpiredGuests(): Promise<number> {
    const result = await this.userRepository
      .createQueryBuilder()
      .delete()
      .where('role = :role', { role: UserRole.GUEST })
      .andWhere('expiresAt < :now', { now: new Date() })
      .andWhere('totalOrders = 0')
      .execute();

    const count = result.affected || 0;

    if (count > 0) {
      this.logger.log(`🧹 Cleaned up ${count} expired guest users`);
    }

    return count;
  }

  async getGuestStats(): Promise<{
    total: number;
    expiring: number;
    expired: number;
  }> {
    const now = new Date();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [total, expiring, expired] = await Promise.all([
      this.userRepository.count({ where: { role: UserRole.GUEST } }),
      this.userRepository
        .createQueryBuilder('user')
        .where('user.role = :role', { role: UserRole.GUEST })
        .andWhere('user.expiresAt < :sevenDays', { sevenDays: sevenDaysFromNow })
        .andWhere('user.expiresAt > :now', { now })
        .getCount(),
      this.userRepository
        .createQueryBuilder('user')
        .where('user.role = :role', { role: UserRole.GUEST })
        .andWhere('user.expiresAt < :now', { now })
        .getCount(),
    ]);

    return { total, expiring, expired };
  }
}