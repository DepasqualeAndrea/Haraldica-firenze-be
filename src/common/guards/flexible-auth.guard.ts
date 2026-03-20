import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../enums/user-roles.enum';

export const RequirePermission = (permission: string) => SetMetadata('permission', permission);
export const RequireAuth = () => SetMetadata('permission', 'customer_only');

@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const requiredPermission = this.reflector.get<string>('permission', context.getHandler());

    // ------------------------------------------------------------------
    // 1. PROVA A LEGGERE JWT DA AUTHORIZATION: BEARER ...
    // ------------------------------------------------------------------
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const cookieToken = request.cookies?.access_token;
    const tokenToVerify = bearerToken || cookieToken;

    if (tokenToVerify) {
      try {
        const payload: any = this.jwtService.verify(tokenToVerify);

        // ✅ CUSTOMER TOKEN
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

        // ✅ GUEST TOKEN
        if (payload.type === UserRole.GUEST && payload.sub) {
          request.user = {
            type: UserRole.GUEST,
            id: payload.sub, // userId guest
            permissions: this.getGuestPermissions(),
          };

          return this.checkPermission(request.user, requiredPermission);
        }
      } catch (error: any) {
        // Token invalido/scaduto → NON creiamo guest qui, continuiamo come anonimo
        console.warn('⚠️ Invalid bearer token in FlexibleAuthGuard:', error.message);
      }
    }

    // ------------------------------------------------------------------
    // 2. NIENTE USER → SE L'ENDPOINT RICHIEDE CUSTOMER/ADMIN, BLOCCA
    // ------------------------------------------------------------------
    if (requiredPermission === 'customer_only' || requiredPermission === 'admin_only') {
      throw new UnauthorizedException('Autenticazione richiesta. Effettua il login.');
    }

    // ------------------------------------------------------------------
    // 3. ENDPOINT PUBBLICO / GUEST: PASSA ANCHE SENZA USER
    //    (il FE userà comunque il guest token per i servizi protetti)
    // ------------------------------------------------------------------
    return true;
  }

  // --------------------------------------------------------------------
  // PERMISSION CHECK
  // --------------------------------------------------------------------
  private checkPermission(user: any, requiredPermission?: string): boolean {
    // Nessun permesso richiesto
    if (!requiredPermission) {
      return true;
    }

    // Solo customer
    if (requiredPermission === 'customer_only') {
      return user.type === UserRole.CUSTOMER;
    }

    // Solo admin
    if (requiredPermission === 'admin_only') {
      return user.type === UserRole.CUSTOMER && user.role === UserRole.ADMIN;
    }

    // Permesso specifico
    return !!user.permissions?.includes(requiredPermission);
  }

  // --------------------------------------------------------------------
  // PERMESSI GUEST
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
  // PERMESSI CUSTOMER / ADMIN
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