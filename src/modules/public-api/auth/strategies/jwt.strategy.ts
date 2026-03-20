// src/modules/public-api/auth/strategies/jwt.strategy.ts

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { UserRole } from 'src/database/entities/user.entity';

export interface JwtPayload {
  sub: string;           // supabaseId for customers, localUserId for guests
  email?: string;
  role?: string;         // 'authenticated' | 'anon' (Supabase roles)
  type?: UserRole | 'guest';
  aal?: string;
  aud?: string | string[];
  permissions?: string[];
  tokenUse?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const supabaseJwtSecret = configService.get<string>('SUPABASE_JWT_SECRET');
    const localJwtSecret = configService.get<string>('jwt.secret');

    if (!supabaseJwtSecret && !localJwtSecret) {
      throw new Error('Neither SUPABASE_JWT_SECRET nor JWT_SECRET is defined');
    }

    const cookieExtractor = (req: any): string | null => {
      if (!req?.cookies) return null;
      return req.cookies['access_token'] || null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      // Use secretOrKeyProvider to support both Supabase JWTs and local guest JWTs
      secretOrKeyProvider: (_req: any, rawToken: string, done: Function) => {
        try {
          // Decode header/payload without verification to determine token type
          const parts = rawToken.split('.');
          if (parts.length !== 3) return done(new Error('Invalid JWT format'), null);

          const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
          const decoded = JSON.parse(payloadStr) as JwtPayload;

          // Guest tokens are signed by our backend with local JWT_SECRET
          if (decoded.type === 'guest') {
            return done(null, localJwtSecret || supabaseJwtSecret);
          }

          // Supabase-issued tokens (customers, admins) use SUPABASE_JWT_SECRET
          done(null, supabaseJwtSecret || localJwtSecret);
        } catch {
          done(null, supabaseJwtSecret || localJwtSecret);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    // ── Guest Token (issued by our backend) ──────────────────────────────
    if (payload.type === 'guest') {
      return {
        type: 'guest',
        id: payload.sub,
        permissions: payload.permissions || this.getGuestPermissions(),
      };
    }

    // ── Supabase Anonymous Session → treat as guest ───────────────────────
    if (payload.role === 'anon' || payload.aud === 'anon') {
      return {
        type: 'guest',
        id: payload.sub,
        permissions: this.getGuestPermissions(),
      };
    }

    // ── Supabase Authenticated Customer ───────────────────────────────────
    if (payload.sub) {
      // Look up by supabaseId first
      let user = await this.usersService.findBySupabaseId(payload.sub);

      // Fallback: try by local userId for backward compatibility
      if (!user) {
        user = await this.usersService.findById(payload.sub);
      }

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Utente non autorizzato');
      }

      return {
        type: 'customer',
        id: user.id,
        sub: user.id,
        supabaseId: user.supabaseId,
        email: user.email,
        role: user.role,
        permissions: this.getUserPermissions(user.role),
        userData: {
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          isTwoFactorEnabled: user.isTwoFactorEnabled,
        },
      };
    }

    throw new UnauthorizedException('Token payload non valido');
  }

  private getUserPermissions(role: UserRole): string[] {
    const permissionsMap: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: [
        'admin:*', 'products:*', 'orders:*', 'users:*',
        'analytics:*', 'settings:*', 'inventory:*', 'coupons:*',
        'categories:*', 'reviews:*', 'notifications:*',
      ],
      [UserRole.CUSTOMER]: [
        'products:view', 'products:search', 'cart:*',
        'orders:view_own', 'orders:create', 'orders:cancel_own',
        'checkout:*', 'profile:view_own', 'profile:edit_own',
        'addresses:*', 'reviews:create', 'reviews:edit_own', 'wishlist:*',
      ],
      [UserRole.GUEST]: [
        'products:view', 'products:search', 'cart:*',
        'checkout:*', 'orders:create', 'orders:track',
      ],
    };

    return permissionsMap[role] || permissionsMap[UserRole.GUEST];
  }

  private getGuestPermissions(): string[] {
    return [
      'products:view', 'products:search', 'cart:*',
      'checkout:*', 'orders:create', 'orders:track',
    ];
  }
}
