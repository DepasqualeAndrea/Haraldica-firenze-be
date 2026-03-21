// src/modules/public-api/auth/auth.service.ts

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { Order, OrderType } from 'src/database/entities/order.entity';
import { TokenBlacklistService } from 'src/common/security/token-blacklist.service';
import { User, UserRole } from 'src/database/entities/user.entity';
import { UpgradeFromOrderDto } from './dto/upgrade-from-order.dto';
import { GuestTokenService } from './guest-token.service';
import { JwtPayload } from './strategies/jwt.strategy';

export interface GuestTokenPayload {
  sub: string;      // userId
  email: string;
  role: UserRole;
  type: 'guest';
  iat?: number;     // issued at (opzionale, generato da JWT)
  exp?: number;     // expiration (opzionale, generato da JWT)
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,

    private jwtService: JwtService,
    private configService: ConfigService,
    private guestTokenService: GuestTokenService,

    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,

    private eventEmitter: EventEmitter2,
    private tokenBlacklistService: TokenBlacklistService,
  ) { }

  // =============================
  // SUPABASE WEBHOOK SYNC
  // =============================
  /**
   * Handles Supabase Auth webhook events to keep local DB in sync.
   * Called by POST /auth/sync
   */
  async handleSupabaseWebhook(event: { type: string; record: any }) {
    this.logger.log(`📡 Supabase webhook: ${event.type}`);

    if (event.type === 'INSERT' && event.record?.id) {
      const meta = event.record.raw_user_meta_data || {};
      // For Google OAuth, Supabase stores full_name; split it into firstName/lastName
      const fullNameParts = meta.full_name ? meta.full_name.split(' ') : [];
      await this.usersService.findOrCreateFromSupabase({
        sub: event.record.id,
        email: event.record.email,
        firstName: meta.firstName || fullNameParts[0],
        lastName: meta.lastName || fullNameParts.slice(1).join(' '),
        dateOfBirth: meta.dateOfBirth,
        gender: meta.gender,
        marketingConsent: meta.marketingConsent,
      });
    } else if (event.type === 'DELETE' && event.record?.id) {
      const user = await this.usersService.findBySupabaseId(event.record.id);
      if (user) {
        await this.usersService.deactivate(user.id);
        this.logger.log(`⚠️ Utente disattivato da evento Supabase DELETE: ${user.email}`);
      }
    }

    return { received: true };
  }


  async validateGuestToken(token: string): Promise<GuestTokenPayload> {
    try {
      // ✅ Verifica JWT token
      const decoded = this.jwtService.verify<GuestTokenPayload>(token);

      // ✅ Verifica che sia guest
      if (decoded.type !== 'guest') {
        throw new UnauthorizedException('Token non è di tipo guest');
      }

      // ✅ Verifica che user esista e sia valido
      const isValid = await this.guestTokenService.verifyGuestToken(decoded.sub);

      if (!isValid) {
        throw new UnauthorizedException('Guest user non valido o scaduto');
      }

      return decoded;
    } catch (error) {
      this.logger.error(`❌ Errore validazione guest token: ${error.message}`);
      throw new UnauthorizedException('Guest token non valido');
    }
  }

  // =============================
  // GET CURRENT USER (FLEXIBLE AUTH)
  // =============================
  async getCurrentUser(req: any) {
    const user = req.user;

    if (user?.type === 'guest') {
      return {
        type: 'guest',
        id: user.id,  // ✅ userId
        permissions: user.permissions,
      };
    }

    if (user?.type === 'customer') {
      return {
        type: 'customer',
        id: user.sub || user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        userData: user.userData,
      };
    }

    throw new UnauthorizedException('Tipo utente non valido');
  }

  // =============================
  // REFRESH TOKEN
  // =============================
  async refreshToken(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utente non autorizzato');
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email || user.lastCheckoutEmail || '',
      role: user.role,
      type: UserRole.CUSTOMER,
      tokenUse: 'access',
    };
    const tokens = this.issueTokens(payload);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
    };
  }

  // =============================
  // PROFILO
  // =============================
  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('Utente non trovato');
    return user;
  }

  // =============================
  // INVALIDAZIONE TOKEN (LOGOUT)
  // =============================
  async invalidateToken(token: string): Promise<void> {
    try {
      const decoded: any = this.jwtService.decode(token);
      if (decoded?.exp) {
        const now = Math.floor(Date.now() / 1000);
        const expSeconds = decoded.exp - now;
        if (expSeconds > 0) {
          await this.tokenBlacklistService.add(token, expSeconds);
        }
      }
    } catch {
      // Ignora errori di decode
    }
  }

  // =============================
  // REFRESH TOKEN VALIDATION
  // =============================
  async refreshWithToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token mancante');
    }

    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(refreshToken);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token invalidato');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token non valido');
    }

    if (payload.tokenUse !== 'refresh') {
      throw new UnauthorizedException('Token non è di tipo refresh');
    }

    return this.refreshToken(payload.sub);
  }

  private issueTokens(payload: JwtPayload): AuthTokens {
    const jwtConfig = this.configService.get('jwt');
    const accessToken = this.jwtService.sign(
      { ...payload, tokenUse: 'access' },
      { expiresIn: jwtConfig.expiresIn },
    );
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenUse: 'refresh' },
      { expiresIn: jwtConfig.refreshExpiresIn },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: jwtConfig.expiresIn,
      refreshExpiresIn: jwtConfig.refreshExpiresIn,
    };
  }

  // =============================
  // UPGRADE GUEST → CUSTOMER
  // =============================
  /**
   * Associates a guest order with an authenticated Supabase user.
   * Call this after the user completes Supabase registration/login.
   */
  async upgradeFromOrder(dto: UpgradeFromOrderDto) {
    const order = await this.ordersService.findOne(dto.orderId);
    if (!order) throw new NotFoundException('Ordine non trovato');

    if (order.userId && order.orderType === OrderType.CUSTOMER) {
      throw new ConflictException('Ordine già associato ad utente registrato');
    }

    if (order.customerEmail &&
      order.customerEmail.toLowerCase() !== dto.email.toLowerCase()) {
      throw new BadRequestException('Email non coincide con quella dell\'ordine');
    }

    // Find or create local user by email
    let user = await this.usersService.findByEmail(dto.email);
    const reusedAccount = !!user;

    if (!user) {
      user = await this.usersService.create({
        email: dto.email.toLowerCase(),
        firstName: '',
        lastName: '',
        role: UserRole.CUSTOMER,
        isActive: true,
      } as any);
    }

    // Associate order with user
    await this.ordersService.orderRepository.update(order.id, {
      userId: user.id,
      customerEmail: dto.email.toLowerCase(),
      orderType: OrderType.CUSTOMER,
    });

    // Optionally merge guest cart
    if (order.user?.id && order.user.id !== user.id) {
      await this.usersService.mergeGuestCart(order.user.id, user.id).catch(() => {});
    }

    this.eventEmitter.emit('guest.upgraded', {
      orderId: order.id,
      newUserId: user.id,
      email: dto.email.toLowerCase(),
      reusedAccount,
    });

    return {
      message: 'Account associato all\'ordine con successo',
      userId: user.id,
      email: user.email,
      reusedAccount,
    };
  }

  // =============================
  // HELPER
  // =============================
  async findUserByEmail(email: string): Promise<User | null> {
    return this.usersService.findByEmail(email);
  }
}