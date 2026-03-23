import {
  Injectable, Logger, NotFoundException, BadRequestException, forwardRef, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { User, UserRole } from 'src/database/entities/user.entity';
import {
  CartResponseDto, AddToCartDto, CartOperationResponseDto, UpdateCartItemDto, CartTotalsDto,
} from './dto/cart.dto';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Cart } from 'src/database/entities/cart.entity';
import { CartCacheService } from './cart-cache.service';

type CartType = 'guest' | 'customer';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(Cart) private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem) private cartItemRepository: Repository<CartItem>,
    @InjectRepository(ProductVariant) private variantRepository: Repository<ProductVariant>,
    @InjectRepository(User) private userRepository: Repository<User>,
    private dataSource: DataSource,
    private cartCacheService: CartCacheService,
  ) {}

  // ── Core Cart Operations ───────────────────────────────────────────────────

  async getCart(identifier: string, type: CartType, manager?: EntityManager): Promise<Cart> {
    const em = manager || this.dataSource.manager;
    const userId = await this.resolveUserId(em, identifier, type);

    let cart = await em
      .createQueryBuilder(Cart, 'cart')
      .leftJoinAndSelect('cart.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('cart.userId = :userId', { userId })
      .orderBy('items.createdAt', 'ASC')
      .getOne();

    if (!cart) {
      const result = await em
        .createQueryBuilder()
        .insert()
        .into(Cart)
        .values({ userId, expiresAt: type === 'guest' ? new Date(Date.now() + 7 * 86_400_000) : null })
        .returning('*')
        .execute();

      cart = result.generatedMaps[0] as Cart;
      cart.items = [];
    }

    // Estendi scadenza guest se < 5 giorni
    if (type === 'guest' && cart.expiresAt && cart.expiresAt < new Date(Date.now() + 5 * 86_400_000)) {
      setImmediate(async () => {
        try {
          await this.dataSource.createQueryBuilder().update(Cart)
            .set({ expiresAt: new Date(Date.now() + 7 * 86_400_000) })
            .where('id = :id', { id: cart.id }).execute();
        } catch (e) {
          this.logger.warn(`⚠️ Estensione scadenza cart fallita: ${e.message}`);
        }
      });
    }

    return cart;
  }

  async getCartWithTotals(identifier: string, type: CartType): Promise<CartResponseDto> {
    const cart = await this.getCart(identifier, type);
    const cartDto = plainToClass(CartResponseDto, cart, { excludeExtraneousValues: true }) as CartResponseDto;
    cartDto.totals = this.calculateTotals(cart);
    return cartDto;
  }

  async addToCart(identifier: string, dto: AddToCartDto, type: CartType): Promise<CartOperationResponseDto> {
    const { variantId, size, quantity, notes } = dto;

    const variant = await this.findPurchasableVariant(variantId);

    // Verifica che la taglia esista e abbia stock
    const sizeStock = variant.getStockForSize(size);
    if (sizeStock <= 0) {
      throw new BadRequestException(
        `Taglia ${size} non disponibile per ${variant.product?.name} - ${variant.colorName}.`,
      );
    }

    const cart = await this.getCart(identifier, type);

    // Cerca item esistente per stessa variante + stessa taglia
    const existingItem = cart.items.find(
      i => i.variantId === variantId && (i as any).size === size,
    );
    const newTotalQty = (existingItem?.quantity || 0) + quantity;

    if (sizeStock < newTotalQty) {
      throw new BadRequestException(
        `Stock insufficiente per ${variant.product?.name} (${variant.colorName} / ${size}). ` +
        `Richiesto: ${newTotalQty}, Disponibile: ${sizeStock}`,
      );
    }

    if (existingItem) {
      const payload: Partial<CartItem> = { quantity: newTotalQty };
      if (notes !== undefined) payload.notes = notes;
      await this.cartItemRepository.update(existingItem.id, payload);
    } else {
      const newItem = this.cartItemRepository.create({
        cartId: cart.id,
        variantId: variant.id,
        size,                                  // taglia selezionata
        quantity,
        notes,
        lockedPrice: variant.effectivePrice,   // SECURITY: price lock
        priceLockTimestamp: new Date(),
      });
      await this.cartItemRepository.insert(newItem);
    }

    const updatedCart = await this.getCartWithTotals(identifier, type);

    return {
      success: true,
      message: `${variant.product?.name} (${variant.colorName} / ${size}) ${existingItem ? 'aggiornato' : 'aggiunto'} al carrello`,
      cart: updatedCart,
    };
  }

  async updateCartItem(identifier: string, itemId: string, dto: UpdateCartItemDto, type: CartType): Promise<CartOperationResponseDto> {
    if (dto.quantity <= 0) return this.removeFromCart(identifier, itemId, type);

    const cart = await this.getCart(identifier, type);
    const item = cart.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Articolo non trovato nel carrello');

    const variant = await this.findPurchasableVariant(item.variantId);
    const itemSize = (item as any).size as string;
    const sizeStock = variant.getStockForSize(itemSize);
    if (sizeStock < dto.quantity) {
      throw new BadRequestException(`Stock insufficiente per taglia ${itemSize}. Disponibile: ${sizeStock}`);
    }

    const payload: Partial<CartItem> = { quantity: dto.quantity };
    if (dto.notes !== undefined) payload.notes = dto.notes;
    await this.cartItemRepository.update(item.id, payload);

    const updatedCart = await this.getCartWithTotals(identifier, type);
    return { success: true, message: 'Quantità aggiornata', cart: updatedCart };
  }

  async removeFromCart(identifier: string, itemId: string, type: CartType): Promise<CartOperationResponseDto> {
    const cart = await this.getCart(identifier, type);
    const item = cart.items.find(i => i.id === itemId);
    if (!item) throw new NotFoundException('Articolo non trovato nel carrello');

    await this.cartItemRepository.remove(item);
    const updatedCart = await this.getCartWithTotals(identifier, type);
    return { success: true, message: 'Articolo rimosso dal carrello', cart: updatedCart };
  }

  async clearCart(identifier: string, type: CartType, manager?: EntityManager): Promise<CartOperationResponseDto> {
    const em = manager || this.dataSource.manager;
    const cart = await this.getCart(identifier, type, em);
    if (cart.items.length > 0) await em.delete(CartItem, { cartId: cart.id });
    const updatedCart = await this.getCartWithTotals(identifier, type);
    return { success: true, message: 'Carrello svuotato', cart: updatedCart };
  }

  // ── Merge Guest → Customer ─────────────────────────────────────────────────

  async migrateGuestToUser(guestUserId: string, customerUserId: string): Promise<void> {
    return this.dataSource.transaction(async (em) => {
      this.logger.log(`🔄 Migrating cart: guest ${guestUserId} → customer ${customerUserId}`);

      const guestUser = await em.findOne(User, { where: { id: guestUserId, role: UserRole.GUEST } });
      if (!guestUser) { this.logger.warn(`⚠️ Guest user ${guestUserId} non trovato`); return; }

      const guestCart = await em.findOne(Cart, {
        where: { userId: guestUserId },
        relations: ['items', 'items.variant'],
      });

      if (!guestCart || guestCart.isEmpty()) {
        await em.remove(guestUser);
        return;
      }

      let customerCart = await em.findOne(Cart, { where: { userId: customerUserId }, relations: ['items'] });
      if (!customerCart) {
        customerCart = em.create(Cart, { userId: customerUserId, items: [] });
        customerCart = await em.save(customerCart);
      }

      for (const guestItem of guestCart.items) {
        const existing = customerCart.items.find(x => x.variantId === guestItem.variantId);
        if (existing) {
          await em.update(CartItem, existing.id, { quantity: existing.quantity + guestItem.quantity });
        } else {
          await em.insert(CartItem, {
            cartId: customerCart.id,
            variantId: guestItem.variantId,
            quantity: guestItem.quantity,
            notes: guestItem.notes,
            lockedPrice: guestItem.lockedPrice,
            priceLockTimestamp: guestItem.priceLockTimestamp,
          });
        }
      }

      await em.remove(guestCart);
      await em.remove(guestUser);
      this.logger.log(`✅ Cart merged: guest ${guestUserId} → customer ${customerUserId}`);
    });
  }

  // ── Validation ────────────────────────────────────────────────────────────

  async validateCartForCheckout(
    cartIdentifier: string,
    cartType: CartType,
    manager?: EntityManager,
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const em = manager || this.dataSource.manager;
    const cart = await this.getCart(cartIdentifier, cartType, em);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!cart?.items?.length) {
      errors.push('Il carrello è vuoto');
      return { valid: false, errors, warnings };
    }

    for (const item of cart.items) {
      const variant = item.variant;
      if (!variant) { errors.push(`Variante ${item.variantId} non trovata`); continue; }
      const itemSize = (item as any).size as string;
      if (!variant.isActive || !variant.product?.isActive) {
        errors.push(`${variant.product?.name ?? 'Articolo'} (${variant.colorName} / ${itemSize}) non è più disponibile`);
        continue;
      }
      const sizeStock = variant.getStockForSize(itemSize);
      if (sizeStock < item.quantity) {
        if (sizeStock === 0) {
          errors.push(`${variant.product.name} (${variant.colorName} / ${itemSize}) è esaurito`);
        } else {
          warnings.push(`${variant.product.name}: disponibili solo ${sizeStock} pz per taglia ${itemSize} (richiesti: ${item.quantity})`);
        }
      }
      // SECURITY: controlla variazione prezzo >10%
      if (item.lockedPrice) {
        const current = variant.effectivePrice;
        const pct = item.getPriceChangePercent(current);
        if (Math.abs(pct) > 10) {
          const dir = pct > 0 ? 'aumentato' : 'diminuito';
          warnings.push(`Il prezzo di ${variant.product.name} è ${dir} del ${Math.abs(pct).toFixed(0)}% — verrà applicato il prezzo bloccato.`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async isItemInCart(identifier: string, variantId: string, type: CartType): Promise<boolean> {
    const cart = await this.getCart(identifier, type);
    return cart.items.some(i => i.variantId === variantId);
  }

  async getCartItemCount(identifier: string, type: CartType): Promise<number> {
    try {
      const cart = await this.getCart(identifier, type);
      return cart.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    } catch {
      return 0;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanupExpiredGuestCarts(): Promise<number> {
    const result = await this.cartRepository.createQueryBuilder()
      .delete().where('expiresAt IS NOT NULL').andWhere('expiresAt < :now', { now: new Date() }).execute();
    const count = result.affected || 0;
    this.logger.log(`🧹 Rimossi ${count} carrelli guest scaduti`);
    return count;
  }

  async cleanupExpiredGuestUsers(): Promise<number> {
    const result = await this.userRepository.createQueryBuilder()
      .delete().where('role = :role', { role: UserRole.GUEST })
      .andWhere('expiresAt IS NOT NULL').andWhere('expiresAt < :now', { now: new Date() }).execute();
    const count = result.affected || 0;
    this.logger.log(`🧹 Rimossi ${count} guest users scaduti`);
    return count;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /** Trova variante acquistabile e valida disponibilità */
  async findPurchasableVariant(variantId: string): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['product', 'product.category'],
    });

    if (!variant) throw new NotFoundException(`Variante ID ${variantId} non trovata`);
    if (!variant.isActive) throw new BadRequestException(`Questa variante non è più disponibile`);
    if (!variant.product?.isActive) throw new BadRequestException(`Il prodotto ${variant.product?.name} non è più disponibile`);

    return variant;
  }

  /**
   * Calcola totali carrello.
   * SECURITY: Usa lockedPrice per prevenire price manipulation.
   */
  private calculateTotals(cart: Cart): CartTotalsDto {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalItems = 0;
    let allItemsAvailable = true;

    for (const item of cart.items) {
      const variant = item.variant;
      if (!variant) { allItemsAvailable = false; continue; }

      // SECURITY: usa lockedPrice se disponibile
      const price = item.lockedPrice ? Number(item.lockedPrice) : variant.effectivePrice;
      const itemSubtotal = price * item.quantity;

      subtotal += itemSubtotal;
      totalDiscount += 0; // Sconti gestiti a livello di coupon (ordine)
      totalItems += item.quantity;

      if (variant.getStockForSize((item as any).size) < item.quantity) allItemsAvailable = false;
    }

    const estimatedShipping = this.calculateEstimatedShipping(subtotal);
    const grandTotal = subtotal + estimatedShipping;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      totalDiscount: parseFloat(totalDiscount.toFixed(2)),
      total: parseFloat(subtotal.toFixed(2)),
      totalItems,
      uniqueItems: cart.items.length,
      allItemsAvailable,
      estimatedShipping: parseFloat(estimatedShipping.toFixed(2)),
      grandTotal: parseFloat(grandTotal.toFixed(2)),
    };
  }

  /** Spedizione gratuita sopra 200€ (soglia luxury) */
  private calculateEstimatedShipping(subtotal: number): number {
    return subtotal >= 200 ? 0 : 9.90;
  }

  private async resolveUserId(em: EntityManager, identifier: string, type: CartType): Promise<string> {
    const cached = this.cartCacheService.getCachedUser(identifier, type);
    if (cached) return cached.id;

    if (type === 'customer') {
      const user = await em.createQueryBuilder(User, 'u').select('u.id').where('u.id = :id', { id: identifier }).getOne();
      if (!user) throw new BadRequestException(`Utente ${identifier} non trovato`);
      this.cartCacheService.setCachedUser(identifier, type, user);
      return user.id;
    }

    const user = await em.createQueryBuilder(User, 'u')
      .select(['u.id', 'u.expiresAt'])
      .where('u.id = :id', { id: identifier })
      .andWhere('u.role = :role', { role: UserRole.GUEST })
      .getOne();

    if (!user) throw new NotFoundException(`Guest user ${identifier} non trovato`);

    if (!user.expiresAt || user.expiresAt < new Date(Date.now() + 60 * 86_400_000)) {
      const nowPlus90 = new Date(Date.now() + 90 * 86_400_000);
      await em.createQueryBuilder().update(User).set({ expiresAt: nowPlus90 }).where('id = :id', { id: user.id }).execute();
    }

    this.cartCacheService.setCachedUser(identifier, type, user);
    return user.id;
  }
}
