// src/modules/public-api/wishlists/wishlists.controller.ts

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Guards & Decorators
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// Service & DTOs
import { WishlistsService } from './wishlists.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@ApiTags('Wishlist')
@Controller('wishlists')
// @UseGuards(JwtAuthGuard) - Removed: using global FlexibleAuthGuard
@ApiBearerAuth()
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  @Get()
  @ApiOperation({ summary: 'Ottieni la mia wishlist' })
  @ApiResponse({ status: 200, description: 'Wishlist restituita con successo' })
  async getWishlist(@CurrentUser() user: any) {
    const items = await this.wishlistsService.getUserWishlist(user.id);
    const count = items.length;

    return {
      success: true,
      wishlist: items,
      count,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Aggiungi prodotto alla wishlist' })
  @ApiResponse({ status: 201, description: 'Prodotto aggiunto alla wishlist' })
  @ApiResponse({ status: 404, description: 'Prodotto non trovato' })
  @ApiResponse({ status: 409, description: 'Prodotto già in wishlist' })
  async addToWishlist(
    @CurrentUser() user: any,
    @Body() dto: AddToWishlistDto,
  ) {
    const item = await this.wishlistsService.addToWishlist(user.id, dto);
    return {
      success: true,
      message: 'Prodotto aggiunto alla wishlist',
      item,
    };
  }

  @Post('toggle/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle prodotto in wishlist (aggiungi/rimuovi)' })
  @ApiResponse({ status: 200, description: 'Stato wishlist aggiornato' })
  async toggleWishlist(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
  ) {
    const result = await this.wishlistsService.toggleWishlist(user.id, productId);
    return {
      success: true,
      ...result,
    };
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rimuovi prodotto dalla wishlist' })
  @ApiResponse({ status: 200, description: 'Prodotto rimosso dalla wishlist' })
  @ApiResponse({ status: 404, description: 'Prodotto non in wishlist' })
  async removeFromWishlist(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
  ) {
    await this.wishlistsService.removeFromWishlist(user.id, productId);
    return {
      success: true,
      message: 'Prodotto rimosso dalla wishlist',
    };
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Verifica se un prodotto è nella wishlist' })
  @ApiResponse({ status: 200, description: 'Stato wishlist per prodotto' })
  async checkWishlist(
    @CurrentUser() user: any,
    @Param('productId') productId: string,
  ) {
    const isInWishlist = await this.wishlistsService.isInWishlist(user.id, productId);
    return {
      success: true,
      isInWishlist,
    };
  }

  @Get('count')
  @ApiOperation({ summary: 'Ottieni numero di prodotti in wishlist' })
  @ApiResponse({ status: 200, description: 'Conteggio wishlist' })
  async getWishlistCount(@CurrentUser() user: any) {
    const count = await this.wishlistsService.getWishlistCount(user.id);
    return {
      success: true,
      count,
    };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Svuota tutta la wishlist' })
  @ApiResponse({ status: 200, description: 'Wishlist svuotata' })
  async clearWishlist(@CurrentUser() user: any) {
    const removed = await this.wishlistsService.clearWishlist(user.id);
    return {
      success: true,
      message: `${removed} prodotti rimossi dalla wishlist`,
      removed,
    };
  }
}
