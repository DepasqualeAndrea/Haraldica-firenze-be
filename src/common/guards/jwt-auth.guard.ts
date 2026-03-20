import { Injectable, ExecutionContext, UnauthorizedException, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenBlacklistService } from '../security/token-blacklist.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Optional() private readonly blacklist?: TokenBlacklistService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Prima esegui validazione JWT standard
    const isValid = await super.canActivate(context);
    if (!isValid) {
      return false;
    }

    const req = context.switchToHttp().getRequest();
    const isLogout = req.url?.endsWith('/auth/logout');

    // Skip blacklist check per logout endpoint
    if (isLogout) {
      return true;
    }

    // ✅ Verifica blacklist (async) - solo se il servizio è disponibile
    if (this.blacklist) {
      const authHeader = req.headers?.authorization as string | undefined;
      const tokenFromHeader = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;
      const tokenFromCookie = req.cookies?.access_token as string | undefined;
      const token = tokenFromHeader || tokenFromCookie;
      if (token) {
        const isBlacklisted = await this.blacklist.isBlacklisted(token);
        if (isBlacklisted) {
          throw new UnauthorizedException('Token invalidato (logout).');
        }
      }
    }

    return true;
  }

  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Token JWT non valido');
    }
    return user;
  }
}