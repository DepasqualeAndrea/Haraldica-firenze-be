// src/modules/public-api/cart/cart.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  BulkAddToCartDto,
  CartBatchUpdateDto,
  CartResponseDto,
  CartOperationResponseDto,
} from './dto/cart.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt.guard';

@Controller('cart')
export class CartController {
  private readonly logger = new Logger(CartController.name);

  constructor(private readonly cartService: CartService) { }

  private resolveUserCart(req: any): {
    identifier: string;
    type: 'guest' | 'customer';
  } {
    const userType = req.user?.type || 'customer';

    let identifier: string;

    if (userType === 'guest') {
      identifier = req.user.id;
    } else {
      identifier = req.user.id || req.user.sub;
    }

    if (!identifier) {
      throw new BadRequestException('User identifier mancante');
    }

    return { identifier, type: userType };
  }

  // ===========================
  // 🔓 GUEST CART ENDPOINTS
  // ===========================

  /**
   * POST /cart
   * Crea nuovo carrello guest
   * @body { userId: string }
   * @returns { cartId, userId, items, totals }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createGuestCart(@Body('userId') userId: string): Promise<CartResponseDto> {
    if (!userId) {
      throw new BadRequestException('userId è richiesto per creare un carrello guest');
    }

    this.logger.log(`📝 Creazione carrello guest per userId: ${userId}`);
    return this.cartService.getCartWithTotals(userId, 'guest');
  }

  /**
   * GET /cart/guest/:userId
   * Recupera carrello guest tramite userId
   */
  @Get('guest/:userId')
  async getGuestCart(@Param('userId') userId: string): Promise<CartResponseDto> {
    this.logger.log(`🔍 Recupero carrello guest: ${userId}`);
    return this.cartService.getCartWithTotals(userId, 'guest');
  }

  /**
   * POST /cart/guest/:userId/items
   * Aggiungi prodotto al carrello guest
   */
  @Post('guest/:userId/items')
  async addToGuestCart(
    @Param('userId') userId: string,
    @Body() addToCartDto: AddToCartDto,
  ): Promise<CartOperationResponseDto> {
    this.logger.log(`➕ Aggiungi al carrello guest ${userId}: ${addToCartDto.variantId}`);
    return this.cartService.addToCart(userId, addToCartDto, 'guest');
  }

  /**
   * PUT /cart/guest/:userId/items/:itemId
   * Modifica quantità item carrello guest
   */
  @Put('guest/:userId/items/:itemId')
  async updateGuestCartItem(
    @Param('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() updateDto: UpdateCartItemDto,
  ): Promise<CartOperationResponseDto> {
    this.logger.log(`✏️ Modifica item ${itemId} in carrello guest ${userId}`);
    return this.cartService.updateCartItem(userId, itemId, updateDto, 'guest');
  }

  /**
   * DELETE /cart/guest/:userId/items/:itemId
   * Rimuovi item dal carrello guest
   */
  @Delete('guest/:userId/items/:itemId')
  async removeFromGuestCart(
    @Param('userId') userId: string,
    @Param('itemId') itemId: string,
  ): Promise<CartOperationResponseDto> {
    this.logger.log(`🗑️ Rimuovi item ${itemId} da carrello guest ${userId}`);
    return this.cartService.removeFromCart(userId, itemId, 'guest');
  }

  /**
   * DELETE /cart/guest/:userId
   * Svuota carrello guest
   */
  @Delete('guest/:userId')
  async clearGuestCart(@Param('userId') userId: string): Promise<CartOperationResponseDto> {
    this.logger.log(`🧹 Svuota carrello guest ${userId}`);
    return this.cartService.clearCart(userId, 'guest');
  }

  // ===========================
  // 🔐 AUTHENTICATED USER CART ENDPOINTS
  // ===========================

  /**
   * GET /cart
   * Recupera carrello utente autenticato
   * @requires JWT token
   */
  @Get()
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  async getUserCart(@Request() req): Promise<CartResponseDto> {
    const { identifier, type } = this.resolveUserCart(req);
    this.logger.log(`🔍 Recupero carrello ${type}: ${identifier}`);
    return this.cartService.getCartWithTotals(identifier, type);
  }

  /**
   * POST /cart/items
   * Aggiungi prodotto al carrello utente
   * @requires JWT token
   */
  @Post('items')
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  async addToUserCart(
    @Request() req,
    @Body() addToCartDto: AddToCartDto,
  ): Promise<CartOperationResponseDto> {
    const { identifier, type } = this.resolveUserCart(req);
    this.logger.log(`➕ Aggiungi al carrello ${type} ${identifier}: ${addToCartDto.variantId}`);
    return this.cartService.addToCart(identifier, addToCartDto, type);
  }

  /**
   * PUT /cart/items/:itemId
   * Modifica quantità item carrello utente
   * @requires JWT token
   */
  @Put('items/:itemId')
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  async updateUserCartItem(
    @Request() req,
    @Param('itemId') itemId: string,
    @Body() updateDto: UpdateCartItemDto,
  ): Promise<CartOperationResponseDto> {
    const userType = req.user.type || 'customer';
    const identifier = userType === 'guest'
      ? (req.user.userId || req.user.guestuserId || req.user.id)
      : req.user.id;

    this.logger.log(`✏️ Modifica item ${itemId} in carrello ${userType} ${identifier}`);

    return this.cartService.updateCartItem(
      identifier,
      itemId,
      updateDto,
      userType as 'guest' | 'customer'
    );
  }

  /**
   * DELETE /cart/items/:itemId
   * Rimuovi item dal carrello utente
   * @requires JWT token
   */
  @Delete('items/:itemId')
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  async removeFromUserCart(
    @Request() req,
    @Param('itemId') itemId: string
  ): Promise<CartOperationResponseDto> {
    const userType = req.user.type || 'customer';
    const identifier = userType === 'guest'
      ? (req.user.userId || req.user.guestuserId || req.user.id)
      : req.user.id;

    this.logger.log(`🗑️ Rimuovi item ${itemId} da carrello ${userType} ${identifier}`);

    return this.cartService.removeFromCart(
      identifier,
      itemId,
      userType as 'guest' | 'customer'
    );
  }

  /**
   * DELETE /cart
   * Svuota carrello utente
   * @requires JWT token
   */
  @Delete()
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  async clearUserCart(@Request() req): Promise<CartOperationResponseDto> {
    const userType = req.user.type || 'customer';
    const identifier = userType === 'guest'
      ? (req.user.userId || req.user.guestuserId || req.user.id)
      : req.user.id;

    this.logger.log(`🧹 Svuota carrello ${userType} ${identifier}`);

    return this.cartService.clearCart(
      identifier,
      userType as 'guest' | 'customer'
    );
  }

  // ===========================
  // 🔄 MERGE CART (Guest → User dopo login)
  // ===========================

  /**
   * POST /cart/merge
   * Unisci carrello guest con carrello utente dopo login/registrazione
   * @requires JWT token
   * @body { userId: string } - userId del carrello guest
   */
  @Post('merge')
  // @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
  @HttpCode(HttpStatus.OK)
  async mergeGuestCart(
    @Request() req,
    @Body('guestUserId') guestUserId: string,
  ): Promise<CartOperationResponseDto> {
    if (!guestUserId) {
      throw new BadRequestException('guestUserId del carrello guest è richiesto');
    }

    const userId = req.user.id;
    this.logger.log(`🔄 Merge carrello: guest ${guestUserId} → user ${userId}`);

    await this.cartService.migrateGuestToUser(guestUserId, userId);
    const mergedCart = await this.cartService.getCartWithTotals(userId, 'customer');

    return {
      success: true,
      message: 'Carrello guest unito con successo al tuo account',
      cart: mergedCart,
    };
  }

  // ===========================
  // 📊 CALCOLI E VALIDAZIONI
  // ===========================

  /**
   * GET /cart/summary
   * Riepilogo carrello con totali (funziona sia per guest che user)
   * @optional JWT token - se presente usa carrello utente, altrimenti richiede userId
   */
  @Get('summary')
  @UseGuards(OptionalJwtAuthGuard)
  async getCartSummary(
    @Request() req,
    @Body('userId') userId?: string
  ): Promise<CartResponseDto> {
    if (req.user) {
      const userType = req.user.type || 'customer';
      const identifier = userType === 'guest'
        ? (req.user.userId || req.user.guestuserId || req.user.id)
        : req.user.id;

      return this.cartService.getCartWithTotals(
        identifier,
        userType as 'guest' | 'customer'
      );
    } else if (userId) {
      return this.cartService.getCartWithTotals(userId, 'guest');
    } else {
      throw new BadRequestException('Fornisci userId per carrello guest o effettua il login');
    }
  }

  /**
   * POST /cart/validate
   * Valida disponibilità prodotti prima del checkout
   * @optional JWT token
   */
  @Post('validate')
  @UseGuards(OptionalJwtAuthGuard)
  async validateCart(
    @Request() req,
    @Body('userId') userId?: string,  // ✅ Opzionale se non autenticato
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    if (req.user) {
      const { identifier, type } = this.resolveUserCart(req);
      this.logger.log(`✅ Validazione carrello ${type}: ${identifier}`);
      return this.cartService.validateCartForCheckout(identifier, type);
    } else if (userId) {
      this.logger.log(`✅ Validazione carrello guest (no auth): ${userId}`);
      return this.cartService.validateCartForCheckout(userId, 'guest');
    } else {
      throw new BadRequestException('Fornisci userId o effettua il login');
    }
  }
  /**
   * GET /cart/count
   * Numero totale di item nel carrello
   * @optional JWT token
   */
  @Get('count')
  @UseGuards(OptionalJwtAuthGuard)
  async getCartItemCount(
    @Request() req,
    @Body('userId') userId?: string
  ): Promise<{ count: number }> {
    if (req.user) {
      const userType = req.user.type || 'customer';
      const identifier = userType === 'guest'
        ? (req.user.userId || req.user.guestuserId || req.user.id)
        : req.user.id;

      const count = await this.cartService.getCartItemCount(
        identifier,
        userType as 'guest' | 'customer'
      );
      return { count };
    } else if (userId) {
      const count = await this.cartService.getCartItemCount(userId, 'guest');
      return { count };
    } else {
      return { count: 0 };
    }
  }


  // ===========================
  // 🧹 ADMIN/MAINTENANCE (Opzionale)
  // ===========================

  /**
   * POST /cart/cleanup-expired
   * Pulizia carrelli guest scaduti (da chiamare con cron job)
   * @admin only - aggiungi guard se necessario
   */
  @Post('cleanup-expired')
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredCarts(): Promise<{ removed: number; message: string }> {
    this.logger.log('🧹 Pulizia carrelli guest scaduti');
    const removed = await this.cartService.cleanupExpiredGuestCarts();
    return {
      removed,
      message: `${removed} carrelli guest scaduti rimossi`,
    };
  }
}