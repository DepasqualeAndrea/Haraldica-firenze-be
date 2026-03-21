import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../enums/user-roles.enum';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { promisify } from 'util';
import { UsersService } from '../../modules/public-api/users/users.service';

export const RequirePermission = (permission: string) => SetMetadata('permission', permission);
export const RequireAuth = () => SetMetadata('permission', 'customer_only');
export const RequireAdmin = () => SetMetadata('permission', 'admin_only');

@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  private readonly logger = new Logger(FlexibleAuthGuard.name);
  private readonly localJwtSecret: string;
  private readonly jwksClient: jwksRsa.JwksClient;
  private readonly supabaseUrl: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    this.localJwtSecret = process.env.JWT_SECRET || '';
    this.supabaseUrl = process.env.SUPABASE_URL || '';

    // Initialize JWKS client for Supabase ES256 token verification
    this.jwksClient = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `${this.supabaseUrl}/auth/v1/.well-known/jwks.json`,
    });

    this.logger.log('🔐 FlexibleAuthGuard initialized with JWKS support for ES256 tokens');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const requiredPermission = this.reflector.get<string>('permission', context.getHandler());

    // ------------------------------------------------------------------
    // 1. EXTRACT TOKEN FROM AUTHORIZATION HEADER OR COOKIE
    // ------------------------------------------------------------------
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const cookieToken = request.cookies?.access_token;
    const tokenToVerify = bearerToken || cookieToken;

    if (tokenToVerify) {
      try {
        // Decode token header to determine algorithm
        const decoded = jwt.decode(tokenToVerify, { complete: true }) as any;

        if (!decoded || !decoded.header || !decoded.payload) {
          throw new Error('Invalid token format');
        }

        const algorithm = decoded.header.alg;
        let payload: any;

        // ------------------------------------------------------------------
        // 2. VERIFY TOKEN BASED ON ALGORITHM
        // ------------------------------------------------------------------

        if (algorithm === 'ES256') {
          // ✅ SUPABASE TOKEN - Verify with public key from JWKS
          payload = await this.verifySupabaseToken(tokenToVerify, decoded.header.kid);
          this.logger.debug(`✅ Supabase ES256 token verified for: ${payload.email}`);
        } else if (algorithm === 'HS256') {
          // ✅ LOCAL TOKEN - Verify with local JWT secret (for guest tokens)
          payload = jwt.verify(tokenToVerify, this.localJwtSecret, {
            algorithms: ['HS256'],
          });
          this.logger.debug(`✅ Local HS256 token verified`);
        } else {
          throw new Error(`Unsupported algorithm: ${algorithm}`);
        }

        // ------------------------------------------------------------------
        // 3. PROCESS TOKEN PAYLOAD AND SET REQUEST.USER
        // ------------------------------------------------------------------

        // ✅ SUPABASE TOKEN (authenticated user from Supabase)
        if (payload.role === 'authenticated' && payload.sub && payload.email) {
          // Load user from database to get the correct role (admin/customer)
          const dbUser = await this.usersService.findBySupabaseId(payload.sub);

          if (!dbUser || !dbUser.isActive) {
            throw new UnauthorizedException('Utente non autorizzato');
          }

          request.user = {
            type: UserRole.CUSTOMER,
            id: dbUser.id,
            sub: dbUser.supabaseId,
            email: dbUser.email,
            role: dbUser.role, // From database: 'admin' or 'customer'
            permissions: this.getUserPermissions(dbUser.role),
            userData: {
              firstName: dbUser.firstName,
              lastName: dbUser.lastName,
              isEmailVerified: dbUser.isEmailVerified,
            },
          };

          this.logger.debug(`✅ User authenticated: ${dbUser.email} (role: ${dbUser.role})`);

          return this.checkPermission(request.user, requiredPermission);
        }

        // ✅ LOCAL CUSTOMER TOKEN (old format, for backward compatibility)
        if (payload.type === UserRole.CUSTOMER && payload.sub && payload.email) {
          request.user = {
            type: UserRole.CUSTOMER,
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            role: payload.role || UserRole.CUSTOMER,
            permissions: this.getUserPermissions(payload.role || UserRole.CUSTOMER),
            userData: payload.userData,
          };

          return this.checkPermission(request.user, requiredPermission);
        }

        // ✅ GUEST TOKEN (from local JWT)
        if (payload.type === UserRole.GUEST && payload.sub) {
          request.user = {
            type: UserRole.GUEST,
            id: payload.sub,
            permissions: this.getGuestPermissions(),
          };

          return this.checkPermission(request.user, requiredPermission);
        }
      } catch (error: any) {
        // Token invalid/expired → Continue as anonymous
        this.logger.warn(`⚠️ Token verification failed: ${error.message}`);
      }
    }

    // ------------------------------------------------------------------
    // 4. NO USER → BLOCK IF ENDPOINT REQUIRES AUTHENTICATION
    // ------------------------------------------------------------------
    if (requiredPermission === 'customer_only' || requiredPermission === 'admin_only') {
      throw new UnauthorizedException('Autenticazione richiesta. Effettua il login.');
    }

    // ------------------------------------------------------------------
    // 5. PUBLIC/GUEST ENDPOINT → ALLOW WITHOUT USER
    // ------------------------------------------------------------------
    return true;
  }

  // --------------------------------------------------------------------
  // VERIFY SUPABASE ES256 TOKEN WITH JWKS PUBLIC KEY
  // --------------------------------------------------------------------
  private async verifySupabaseToken(token: string, kid: string): Promise<any> {
    const getSigningKey = promisify(this.jwksClient.getSigningKey.bind(this.jwksClient));
    const key = await getSigningKey(kid);
    const publicKey = key.getPublicKey();

    return jwt.verify(token, publicKey, {
      algorithms: ['ES256'],
      issuer: `${this.supabaseUrl}/auth/v1`,
    });
  }

  // --------------------------------------------------------------------
  // PERMISSION CHECK
  // --------------------------------------------------------------------
  private checkPermission(user: any, requiredPermission?: string): boolean {
    if (!requiredPermission) {
      return true;
    }

    if (requiredPermission === 'customer_only') {
      return user.type === UserRole.CUSTOMER;
    }

    if (requiredPermission === 'admin_only') {
      return user.type === UserRole.CUSTOMER && user.role === UserRole.ADMIN;
    }

    return !!user.permissions?.includes(requiredPermission);
  }

  // --------------------------------------------------------------------
  // GUEST PERMISSIONS
  // --------------------------------------------------------------------
  private getGuestPermissions(): string[] {
    return [
      'view_products',
      'add_to_cart',
      'checkout',
      'track_order',
      'products:view',
      'products:search',
      'cart:*',
      'checkout:*',
      'orders:create',
      'orders:track',
    ];
  }

  // --------------------------------------------------------------------
  // CUSTOMER / ADMIN PERMISSIONS
  // --------------------------------------------------------------------
  private getUserPermissions(role: string): string[] {
    const basePermissions = [
      'view_products',
      'products:search',
      'cart:*',
      'orders:view_own',
      'orders:create',
      'orders:cancel_own',
      'checkout:*',
      'profile:view_own',
      'profile:edit_own',
      'addresses:*',
      'reviews:create',
      'reviews:edit_own',
      'wishlist:*',
    ];

    if (role === 'admin') {
      return [
        ...basePermissions,
        'admin_only',
        'manage_users',
        'manage_products',
        'manage_orders',
        'view_analytics',
        'manage_inventory',
        'manage_promotions',
      ];
    }

    return basePermissions;
  }
}
