// src/modules/public-api/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Response,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { UpgradeFromOrderDto } from './dto/upgrade-from-order.dto';
import { UserRole } from 'src/database/entities/user.entity';
import { FlexibleAuthGuard } from 'src/common/guards/flexible-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { GuestTokenService } from './guest-token.service';
import { randomBytes } from 'crypto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private ordersService: OrdersService,
    private usersService: UsersService,
    private guestTokenService: GuestTokenService,
    private configService: ConfigService,
  ) { }

  private getCookieOptions(isRefresh = false) {
    const isProduction = this.configService.get('app.environment') === 'production';
    const secure = this.configService.get('COOKIE_SECURE') ?? isProduction;
    const sameSite = (this.configService.get('COOKIE_SAMESITE') || 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    const domain = this.configService.get('COOKIE_DOMAIN') || undefined;

    const jwtConfig = this.configService.get('jwt');
    const expiresIn = isRefresh ? jwtConfig.refreshExpiresIn : jwtConfig.expiresIn;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: this.parseDurationToMs(expiresIn),
    };
  }

  private getCsrfCookieOptions() {
    const isProduction = this.configService.get('app.environment') === 'production';
    const secure = this.configService.get('COOKIE_SECURE') ?? isProduction;
    const sameSite = (this.configService.get('COOKIE_SAMESITE') || 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    const domain = this.configService.get('COOKIE_DOMAIN') || undefined;

    return {
      httpOnly: false,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: 1000 * 60 * 60 * 12, // 12h
    };
  }

  private parseDurationToMs(value: string): number {
    const match = /^(\d+)([smhdw])?$/.exec(value);
    if (!match) return 1000 * 60 * 60;
    const amount = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 1000 * 60,
      h: 1000 * 60 * 60,
      d: 1000 * 60 * 60 * 24,
      w: 1000 * 60 * 60 * 24 * 7,
    };
    return amount * (multipliers[unit] || 1000);
  }

  private setAuthCookies(res: ExpressResponse, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, this.getCookieOptions(false));
    res.cookie('refresh_token', refreshToken, this.getCookieOptions(true));
  }

  private clearAuthCookies(res: ExpressResponse) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Ottieni CSRF token' })
  async getCsrf(@Response({ passthrough: true }) res: ExpressResponse) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie('csrfToken', csrfToken, this.getCsrfCookieOptions());
    return { csrfToken };
  }

  @Post('guest-token')
  @ApiOperation({
    summary: 'Genera o rinnova guest token',
    description: 'Crea nuovo guest user SOLO se non esiste già un token valido',
  })
  async getGuestToken(
    @Body('existingToken') existingToken?: string,
    @Body('userId') userId?: string,
  ) {
    const tokenToValidate = existingToken;

    // 1. Se arriva un existingToken, prova a validarlo e a fare refresh
    if (tokenToValidate) {
      try {
        const payload = await this.authService.validateGuestToken(
          tokenToValidate,
        );

        const isUserValid = await this.guestTokenService.verifyGuestToken(
          payload.sub,
        );

        if (isUserValid) {
          const refreshed =
            await this.guestTokenService.refreshGuestToken(payload.sub);

          this.logger.log(
            `♻️ Guest token refreshed via existingToken: userId=${payload.sub}`,
          );

          return {
            token: refreshed.token,
            userId: refreshed.userId,
            expiresIn: '90d',
            message: 'Guest token refreshed',
          };
        } else {
          this.logger.warn(
            `⚠️ Guest user ${payload.sub} non più valido nel DB`,
          );
        }
      } catch (error: any) {
        this.logger.warn(
          `⚠️ Existing token validation failed: ${error.message}`,
        );
      }
    }

    // 2. Nessun token valido → crea nuovo guest user
    const result = await this.guestTokenService.generateGuestToken(
      tokenToValidate ? undefined : userId,
    );

    this.logger.log(`✅ Nuovo guest token generato: userId=${result.userId}`);

    return {
      token: result.token,
      userId: result.userId,
      expiresIn: '90d',
      message: 'Guest token created',
    };
  }

  @Post('guest-token/validate')
  @ApiOperation({
    summary: 'Valida guest token esistente',
    description: 'Verifica se il guest token è ancora valido senza crearne uno nuovo',
  })
  async validateGuestToken(@Body('token') token: string) {
    try {
      const payload = await this.authService.validateGuestToken(token);
      const isUserValid =
        await this.guestTokenService.verifyGuestToken(payload.sub);

      if (!isUserValid) {
        return {
          valid: false,
          message: 'Guest user non più valido',
        };
      }

      return {
        valid: true,
        userId: payload.sub,
        expiresIn: '90d',
        message: 'Token valido',
      };
    } catch {
      return {
        valid: false,
        message: 'Token non valido o scaduto',
      };
    }
  }


  @Post('check-email')
  @ApiOperation({
    summary: 'Verifica disponibilità email per checkout',
    description: 'Controlla se email esiste e determina se può essere usata per checkout',
  })
  async checkEmail(@Body('email') email: string): Promise<{
    exists: boolean;
    userType: 'guest' | 'customer' | null;
    userId?: string;
    guestOrdersCount?: number;
  }> {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email richiesta');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.authService.findUserByEmail(normalizedEmail);

    if (!user) {
      return {
        exists: false,
        userType: null,
      };
    }

    if (user.role === UserRole.GUEST) {
      const ordersCount = await this.ordersService.countCompletedOrdersByUserId(user.id);

      return {
        exists: true,
        userType: 'guest',
        userId: user.id,
        guestOrdersCount: ordersCount,
      };
    }

    return {
      exists: true,
      userType: 'customer',
      userId: user.id,
    };
  }

  @Post('upgrade-from-order')
  @ApiOperation({ summary: 'Conversione guest → customer partendo da un ordine' })
  async upgradeFromOrder(
    @Body() upgradeDto: UpgradeFromOrderDto,
  ) {
    return this.authService.upgradeFromOrder(upgradeDto);
  }

  @Get('session')
  @UseGuards(FlexibleAuthGuard)
  @ApiOperation({ summary: 'Info sessione (guest o customer)' })
  async session(@Request() req: any) {
    return this.authService.getCurrentUser(req);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profilo utente registrato' })
  async profile(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh token JWT' })
  async refresh(@Request() req: any, @Response({ passthrough: true }) res: ExpressResponse) {
    const refreshToken = req.cookies?.refresh_token;
    const result = await this.authService.refreshWithToken(refreshToken);
    if (result?.accessToken && result?.refreshToken) {
      this.setAuthCookies(res, result.accessToken, result.refreshToken);
    }
    return result;
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Supabase Auth webhook — sincronizza utente',
    description: 'Riceve eventi di Supabase Auth (INSERT/DELETE) per mantenere il DB locale in sync',
  })
  @ApiResponse({ status: 200, description: 'Evento ricevuto' })
  async syncSupabaseUser(@Body() event: { type: string; record: { id: string; email?: string } }) {
    return this.authService.handleSupabaseWebhook(event);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout (idempotente) con invalidazione token se presente' })
  async logout(@Request() req: any, @Response({ passthrough: true }) res: any) {
    const authHeader = req.headers?.authorization as string | undefined;
    const headerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const accessToken = headerToken || req.cookies?.access_token;
    const refreshToken = req.cookies?.refresh_token;

    if (accessToken) {
      try {
        await this.authService.invalidateToken(accessToken);
      } catch { }
    }
    if (refreshToken) {
      try {
        await this.authService.invalidateToken(refreshToken);
      } catch { }
    }

    this.clearAuthCookies(res);
    res.clearCookie('guestToken', { path: '/' });
    res.clearCookie('csrfToken', { path: '/' });
    return { message: 'Logout effettuato' };
  }
}