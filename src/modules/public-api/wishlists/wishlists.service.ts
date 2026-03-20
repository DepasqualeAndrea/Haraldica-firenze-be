// src/modules/public-api/wishlists/wishlists.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Entities
import { Wishlist } from 'src/database/entities/wishlist.entity';
import { Product } from 'src/database/entities/product.entity';

// DTOs
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@Injectable()
export class WishlistsService {
  private readonly logger = new Logger(WishlistsService.name);

  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * Aggiunge un prodotto alla wishlist dell'utente
   */
  async addToWishlist(userId: string, dto: AddToWishlistDto): Promise<Wishlist> {
    // Verifica che il prodotto esista e sia attivo
    const product = await this.productRepository.findOne({
      where: { id: dto.productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Prodotto non trovato o non disponibile');
    }

    // Verifica se già presente in wishlist
    const existing = await this.wishlistRepository.findOne({
      where: { userId, productId: dto.productId },
    });

    if (existing) {
      throw new ConflictException('Prodotto già presente nella wishlist');
    }

    const wishlistItem = this.wishlistRepository.create({
      userId,
      productId: dto.productId,
    });

    const saved = await this.wishlistRepository.save(wishlistItem);
    this.logger.log(`✅ Prodotto ${dto.productId} aggiunto alla wishlist di ${userId}`);

    return this.findOneWithProduct(saved.id);
  }

  /**
   * Rimuove un prodotto dalla wishlist dell'utente
   */
  async removeFromWishlist(userId: string, productId: string): Promise<void> {
    const item = await this.wishlistRepository.findOne({
      where: { userId, productId },
    });

    if (!item) {
      throw new NotFoundException('Prodotto non trovato nella wishlist');
    }

    await this.wishlistRepository.remove(item);
    this.logger.log(`🗑️ Prodotto ${productId} rimosso dalla wishlist di ${userId}`);
  }

  /**
   * Restituisce la wishlist completa dell'utente con i prodotti
   */
  async getUserWishlist(userId: string): Promise<Wishlist[]> {
    return this.wishlistRepository.find({
      where: { userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Verifica se un prodotto è nella wishlist dell'utente
   */
  async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const count = await this.wishlistRepository.count({
      where: { userId, productId },
    });
    return count > 0;
  }

  /**
   * Svuota completamente la wishlist dell'utente
   */
  async clearWishlist(userId: string): Promise<number> {
    const result = await this.wishlistRepository.delete({ userId });
    const count = result.affected || 0;
    this.logger.log(`🧹 Wishlist svuotata per ${userId}: ${count} prodotti rimossi`);
    return count;
  }

  /**
   * Conta il numero di prodotti nella wishlist
   */
  async getWishlistCount(userId: string): Promise<number> {
    return this.wishlistRepository.count({ where: { userId } });
  }

  /**
   * Toggle: aggiunge o rimuove un prodotto dalla wishlist
   */
  async toggleWishlist(userId: string, productId: string): Promise<{
    isInWishlist: boolean;
    message: string;
  }> {
    const isInWishlist = await this.isInWishlist(userId, productId);

    if (isInWishlist) {
      await this.removeFromWishlist(userId, productId);
      return {
        isInWishlist: false,
        message: 'Prodotto rimosso dalla wishlist',
      };
    } else {
      await this.addToWishlist(userId, { productId });
      return {
        isInWishlist: true,
        message: 'Prodotto aggiunto alla wishlist',
      };
    }
  }

  /**
   * Helper: trova un item wishlist con il prodotto associato
   */
  private async findOneWithProduct(id: string): Promise<Wishlist> {
    const item = await this.wishlistRepository.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!item) throw new NotFoundException('Item wishlist non trovato');
    return item;
  }
}
