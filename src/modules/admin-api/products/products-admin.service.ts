import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { plainToClass } from 'class-transformer';

// Services
import { CategoriesService } from '../categories/categories.service';
import { InventoryService } from '../inventory/inventory.service';
import { StripeService } from 'src/modules/public-api/payments/stripe.service';

// Entities
import { Category } from 'src/database/entities/category.entity';
import { Product } from 'src/database/entities/product.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';

// DTOs
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductFilterDto,
  AdminProductListResponseDto,
  ProductStatsResponseDto,
  BulkUpdateProductsDto,
  CreateVariantDto,
  UpdateVariantDto,
  UpdateVariantStockDto,
  VariantResponseDto,
} from './dto/product.dto';

@Injectable()
export class ProductsAdminService {
  private readonly logger = new Logger(ProductsAdminService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
  ) {}

  // ===========================
  // 📝 CREATE (Con Stripe)
  // ===========================

  /**
   * Crea nuovo prodotto con:
   * - Validazione categoria
   * - Integrazione Stripe automatica
   * - Generazione slug SEO
   * (Stock gestito tramite varianti)
   */
  async createProduct(createProductDto: CreateProductDto): Promise<ProductResponseDto> {
    let savedProduct: Product | undefined;

    try {
      // Transaction per garantire atomicità
      await this.productRepository.manager.transaction(async (tx) => {
        // 1) Valida categoria
        const category = await tx.findOne(Category, {
          where: { id: createProductDto.categoryId },
        });
        if (!category) {
          throw new NotFoundException(`Categoria con ID ${createProductDto.categoryId} non trovata`);
        }

        // 2) Sanitizza campi JSON
        const sanitizedDto = this.sanitizeJsonFields(createProductDto);

        // 3) Estrai campi non mappati sull'entity (varianti inline, mainImage/images ignorati)
        const { variants: variantsDto, mainImage: _mainImage, images: _images, ...productFields } = sanitizedDto as any;

        // 4) Crea entity prodotto
        const product = tx.create(Product, {
          ...productFields,
          category,
          slug: productFields.slug || this.generateSlug(productFields.name),
          publishedAt: productFields.publishedAt ? new Date(productFields.publishedAt) : undefined,
        });

        // 5) Salva prodotto
        savedProduct = await tx.save(product);
        this.logger.log(`✅ Prodotto salvato nel DB: ${savedProduct.name} (ID: ${savedProduct.id})`);

        // 6) Crea varianti inline se presenti nel payload
        if (variantsDto?.length) {
          for (const variantDto of variantsDto as any[]) {
            const { id: _variantId, ...variantData } = variantDto;

            // Controlla SKU duplicato prima di inserire
            const skuExists = await tx.findOne(ProductVariant, { where: { sku: variantData.sku } });
            if (skuExists) {
              this.logger.warn(`⚠️ SKU "${variantData.sku}" già esistente, variante saltata`);
              continue;
            }

            const variant = tx.create(ProductVariant, { ...variantData, productId: savedProduct.id });
            await tx.save(variant);
          }
          this.logger.log(`✅ ${variantsDto.length} varianti create per prodotto ${savedProduct.id}`);
        }
      });

      if (!savedProduct) {
        throw new InternalServerErrorException('Errore durante il salvataggio del prodotto');
      }

      // 5) Integrazione Stripe (fuori dalla transaction, non critica)
      try {
        const committedProduct = await this.productRepository.findOne({
          where: { id: savedProduct.id },
          relations: ['category'],
        });

        if (!committedProduct) {
          throw new NotFoundException('Prodotto non trovato dopo il commit');
        }

        await this.handleStripeIntegration(committedProduct, createProductDto);
      } catch (stripeError) {
        this.logger.warn(
          `⚠️ Stripe integration fallita per prodotto ${savedProduct.id}, ma prodotto salvato correttamente`,
          stripeError
        );
      }

      return this.findOneDetailed(savedProduct.id);

    } catch (error) {
      this.logger.error('❌ Errore nella creazione del prodotto:', error);
      throw error;
    }
  }

  /**
   * Gestisce integrazione Stripe per prodotto
   */
  private async handleStripeIntegration(
    product: Product,
    createDto: CreateProductDto
  ): Promise<void> {
    try {
      // Crea prodotto Stripe
      const stripeProduct = await this.stripeService.createProduct({
        name: product.name,
        description: product.description,
        metadata: {
          dbProductId: product.id,
          categoryId: product.category?.id || createDto.categoryId,
        },
      });

      // Crea prezzo Stripe usando basePrice
      const stripePrice = await this.stripeService.createPrice({
        productId: stripeProduct.id,
        amount: product.basePrice,
        metadata: {
          dbProductId: product.id,
          variantType: 'base'
        },
      });

      // Salva riferimenti Stripe
      product.stripeProductId = stripeProduct.id;

      await this.productRepository.save(product);

      this.logger.log(`✅ Integrazione Stripe completata per "${product.name}"`);
    } catch (error) {
      this.logger.error('❌ Errore integrazione Stripe:', error);
      throw error;
    }
  }

  // ===========================
  // 📖 READ
  // ===========================

  /**
   * Trova prodotto per ID (base)
   */
  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'variants'],
    });

    if (!product) {
      throw new NotFoundException(`Prodotto con ID ${id} non trovato`);
    }

    return product;
  }

  /**
   * Trova prodotto per ID (dettagliato con related)
   */
  async findOneDetailed(id: string): Promise<ProductResponseDto> {
    const product = await this.findOne(id);
    const productDetails = this.convertToProductResponseDto(product);

    const numericBasePrice = typeof product.basePrice === 'number' ? product.basePrice : parseFloat(product.basePrice as any);

    const relatedProducts = await this.getRelatedProducts(id, 4);

    return {
      ...productDetails,
      discountPercentage: 0,
      relatedProducts: relatedProducts.map((related) =>
        this.convertToProductResponseDto(related),
      ),
    };
  }

  /**
   * Lista prodotti con filtri admin
   * Nota: Include prodotti disattivati per admin
   */
  async findAll(filters?: ProductFilterDto): Promise<AdminProductListResponseDto> {
    try {
      const query = this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.variants', 'variants');

      // Admin vede anche prodotti disattivati
      // .where('product.isActive = :isActive', { isActive: true }); // RIMOSSO

      this.applyFilters(query, filters);

      const page = filters?.page || 1;
      const limit = filters?.limit || 20;
      const offset = (page - 1) * limit;

      query.skip(offset).take(limit);
      this.applySorting(query, filters);

      const [products, total] = await query.getManyAndCount();
      const productDtos = products.map((p) => this.convertToProductResponseDto(p));

      return {
        products: productDtos,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      };
    } catch (error) {
      this.logger.error('Errore nel recupero lista prodotti admin:', error);
      throw error;
    }
  }

  /**
   * Trova prodotto acquistabile (usato da OrdersService)
   */
  async findPurchasableItem(itemId: string, manager?: EntityManager): Promise<Product> {
    const repo = manager
      ? manager.getRepository(Product)
      : this.productRepository;

    const product = await repo.findOne({ where: { id: itemId } });

    if (!product) {
      throw new NotFoundException(`Prodotto con ID ${itemId} non trovato`);
    }

    return product;
  }

  /**
   * Trova prodotto per Stripe Product ID
   */
  async findByStripeProductId(stripeProductId: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { stripeProductId },
      relations: ['category', 'variants'],
    });

    if (!product) {
      throw new NotFoundException(`Prodotto con Stripe ID ${stripeProductId} non trovato`);
    }

    return product;
  }

  // ===========================
  // ✏️ UPDATE
  // ===========================

  /**
   * Aggiorna prodotto con sync Stripe
   */
  async updateProduct(
    id: string,
    updateProductDto: UpdateProductDto
  ): Promise<ProductResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category']
    });

    if (!product) {
      throw new NotFoundException(`Prodotto con ID ${id} non trovato`);
    }

    try {
      // Salva il basePrice originale PRIMA di qualsiasi modifica (per sync Stripe)
      const originalBasePrice = Number(product.basePrice);

      // Sanitizza JSON fields se presenti
      const _updateDtoAny = updateProductDto as any;
      const sanitizedDto = (_updateDtoAny.keyIngredients || _updateDtoAny.productFaqs)
        ? this.sanitizeJsonFields(updateProductDto as CreateProductDto)
        : updateProductDto;

      // Estrai campi non mappati sull'entity prima del merge
      const {
        categoryId,
        id: _dtoId,
        variants: variantsDto,
        mainImage: _mainImage,  // calcolato, non persiste
        images: _images,        // ignorato, le immagini vivono sulle varianti
        ...productData
      } = sanitizedDto as any;

      // Aggiorna categoria se cambiata
      if (categoryId && (!product.category || categoryId !== product.category.id)) {
        const newCategory = await this.categoryRepository.findOne({
          where: { id: categoryId }
        });

        if (!newCategory) {
          throw new NotFoundException(`Categoria con ID ${categoryId} non trovata`);
        }

        product.category = newCategory;
      }

      // Applica modifiche al prodotto
      this.productRepository.merge(product, productData);
      if (productData.publishedAt) {
        product.publishedAt = new Date(productData.publishedAt);
      }
      const updatedProduct = await this.productRepository.save(product);

      // Upsert varianti inline se presenti nel payload
      if (variantsDto?.length) {
        for (const variantDto of variantsDto as any[]) {
          const { id: variantId, ...variantData } = variantDto;

          if (variantId) {
            // Variante esistente → aggiorna
            const existing = await this.variantRepository.findOne({ where: { id: variantId, productId: id } });
            if (existing) {
              Object.assign(existing, variantData);
              await this.variantRepository.save(existing);
            } else {
              this.logger.warn(`⚠️ Variante ${variantId} non trovata per prodotto ${id}, saltata`);
            }
          } else {
            // Nuova variante → crea solo se SKU non esiste
            const skuExists = await this.variantRepository.exists({ where: { sku: variantData.sku } });
            if (!skuExists) {
              const newVariant = this.variantRepository.create({ ...variantData, productId: id });
              await this.variantRepository.save(newVariant);
            } else {
              this.logger.warn(`⚠️ SKU "${variantData.sku}" già esistente, variante saltata`);
            }
          }
        }
        this.logger.log(`✅ Varianti aggiornate per prodotto ${id}`);
      }

      // Sync Stripe (nome/descrizione)
      if (updatedProduct.stripeProductId && (updateProductDto.name || updateProductDto.description)) {
        try {
          await this.stripeService.updateProduct(updatedProduct.stripeProductId, {
            name: updateProductDto.name || updatedProduct.name,
            description: updateProductDto.description || updatedProduct.description,
          });
        } catch (stripeError) {
          this.logger.warn('Errore aggiornamento Stripe product:', stripeError);
        }
      }

      // Sync Stripe (basePrice) - confronta con originalBasePrice salvato prima del merge
      if (
        typeof updateProductDto.basePrice === 'number' &&
        updateProductDto.basePrice !== originalBasePrice &&
        updatedProduct.stripeProductId
      ) {
        try {
          await this.stripeService.createPrice({
            productId: updatedProduct.stripeProductId,
            amount: updateProductDto.basePrice,
            metadata: { dbProductId: product.id, variantType: 'base' },
          });
          await this.productRepository.save(updatedProduct);
        } catch (stripeError) {
          this.logger.warn('Errore creazione nuovo prezzo Stripe:', stripeError);
        }
      }

      this.logger.log(`✅ Prodotto aggiornato: ${updatedProduct.name}`);
      return this.findOneDetailed(updatedProduct.id);

    } catch (error) {
      this.logger.error(`❌ Errore aggiornamento prodotto ${id}:`, error);
      throw error;
    }
  }

  // ===========================
  // 🗑️ DELETE
  // ===========================

  /**
   * Soft delete prodotto
   */
  async deleteProduct(id: string): Promise<void> {
    const product = await this.findOne(id);

    product.isActive = false;
    await this.productRepository.save(product);

    this.logger.log(`🗑️ Prodotto disattivato: ${product.name} (ID: ${id})`);
  }

  // ===========================
  // 🎨 VARIANT CRUD
  // ===========================

  /**
   * Crea nuova variante per un prodotto
   */
  async createVariant(productId: string, dto: CreateVariantDto): Promise<VariantResponseDto> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Prodotto ${productId} non trovato`);

    const exists = await this.variantRepository.exists({ where: { sku: dto.sku } });
    if (exists) throw new ConflictException(`SKU "${dto.sku}" già esistente`);

    const variant = this.variantRepository.create({ ...dto, productId });
    const saved = await this.variantRepository.save(variant);

    // Registra lo stock iniziale totale (somma di tutte le taglie)
    const totalInitialStock = Object.values(saved.stockPerSize || {}).reduce((sum, qty) => sum + qty, 0);
    await this.inventoryService.recordInitialStock(saved.id, totalInitialStock);

    return plainToClass(VariantResponseDto, {
      ...saved,
      totalStock: totalInitialStock,
      availableSizes: Object.entries(saved.stockPerSize || {}).filter(([, qty]) => qty > 0).map(([s]) => s),
    }, { excludeExtraneousValues: true });
  }

  /**
   * Lista varianti di un prodotto
   */
  async listVariants(productId: string): Promise<VariantResponseDto[]> {
    const variants = await this.variantRepository.find({ where: { productId } });
    return variants.map(v => plainToClass(VariantResponseDto, {
      ...v,
      totalStock: Object.values(v.stockPerSize || {}).reduce((sum, qty) => sum + qty, 0),
      availableSizes: Object.entries(v.stockPerSize || {}).filter(([, qty]) => qty > 0).map(([s]) => s),
    }, { excludeExtraneousValues: true }));
  }

  /**
   * Aggiorna variante
   */
  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto): Promise<VariantResponseDto> {
    const variant = await this.variantRepository.findOne({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException(`Variante ${variantId} non trovata`);

    if (dto.sku && dto.sku !== variant.sku) {
      const exists = await this.variantRepository.exists({ where: { sku: dto.sku } });
      if (exists) throw new ConflictException(`SKU "${dto.sku}" già esistente`);
    }

    Object.assign(variant, dto);
    const saved = await this.variantRepository.save(variant);
    return plainToClass(VariantResponseDto, {
      ...saved,
      totalStock: Object.values(saved.stockPerSize || {}).reduce((sum, qty) => sum + qty, 0),
      availableSizes: Object.entries(saved.stockPerSize || {}).filter(([, qty]) => qty > 0).map(([s]) => s),
    }, { excludeExtraneousValues: true });
  }

  /**
   * Elimina variante
   */
  async deleteVariant(productId: string, variantId: string): Promise<void> {
    const variant = await this.variantRepository.findOne({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException(`Variante ${variantId} non trovata`);
    await this.variantRepository.remove(variant);
  }

  /**
   * Aggiorna stock variante per una taglia specifica (set / add / subtract).
   * Il campo `reason` di UpdateVariantStockDto viene usato come size (es. "M").
   * Se size non è specificato, applica l'operazione alla prima taglia disponibile.
   */
  async updateVariantStock(productId: string, variantId: string, dto: UpdateVariantStockDto): Promise<VariantResponseDto> {
    const variant = await this.variantRepository.findOne({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException(`Variante ${variantId} non trovata`);

    const stockPerSize = { ...(variant.stockPerSize || {}) };
    const size = dto.reason; // convention: reason viene usato come size per questo endpoint

    if (size) {
      const current = stockPerSize[size] ?? 0;
      const op = dto.operation ?? 'set';
      if (op === 'set') stockPerSize[size] = dto.quantity;
      else if (op === 'add') stockPerSize[size] = current + dto.quantity;
      else stockPerSize[size] = Math.max(0, current - dto.quantity);
    } else {
      // Senza size: applica a tutte le taglie (set) o usa la prima disponibile
      const op = dto.operation ?? 'set';
      if (op === 'set') {
        // set uniforme su tutte le taglie (edge case: distribuisce equamente)
        for (const s of Object.keys(stockPerSize)) {
          stockPerSize[s] = dto.quantity;
        }
      }
      // add/subtract senza size non ha senso — ignora silenziosamente
    }

    await this.variantRepository.update(variantId, { stockPerSize });
    variant.stockPerSize = stockPerSize;

    const totalStock = Object.values(stockPerSize).reduce((sum, qty) => sum + qty, 0);
    return plainToClass(VariantResponseDto, {
      ...variant,
      totalStock,
      availableSizes: Object.entries(stockPerSize).filter(([, qty]) => qty > 0).map(([s]) => s),
    }, { excludeExtraneousValues: true });
  }

  // ===========================
  // 📊 DASHBOARD & STATS
  // ===========================

  /**
   * Statistiche dashboard overview
   */
  async getDashboardStats() {
    try {
      const [stats, newWeek] = await Promise.all([
        this.productRepository
          .createQueryBuilder('product')
          .select('COUNT(*)', 'total_products')
          .addSelect("COUNT(CASE WHEN product.isActive = true THEN 1 END)", 'active_products')
          .addSelect("COUNT(CASE WHEN product.isFeatured = true THEN 1 END)", 'featured_products')
          .addSelect("COUNT(CASE WHEN product.isOnSale = true THEN 1 END)", 'on_sale_products')
          .getRawOne(),

        this.productRepository
          .createQueryBuilder('product')
          .select('COUNT(*)', 'new_products_this_week')
          .where('product.createdAt >= :threshold', {
            threshold: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          })
          .getRawOne(),
      ]);

      return {
        ...stats,
        ...newWeek,
        generated_at: new Date(),
      };
    } catch (error) {
      this.logger.error('Errore nel recupero dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Statistiche dettagliate prodotti
   */
  async getProductStats(): Promise<ProductStatsResponseDto> {
    try {
      const stats = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('product.category', 'category')
        .select([
          'COUNT(*) as totalProducts',
          'COUNT(CASE WHEN product.isActive = true THEN 1 END) as activeProducts',
          'COUNT(CASE WHEN product.isFeatured = true THEN 1 END) as featuredProducts',
          'COUNT(CASE WHEN product.isOnSale = true THEN 1 END) as onSaleProducts',
          'AVG(product.basePrice) as averageBasePrice',
        ])
        .getRawOne();

      // Low/out-of-stock calcolati via stockPerSize JSONB
      // totalStock = somma dei valori in stockPerSize
      const allVariants = await this.variantRepository.find({ where: { isActive: true } });
      const lowStockVariants = allVariants.filter(v => {
        const total = Object.values(v.stockPerSize || {}).reduce((s, q) => s + q, 0);
        return total > 0 && total <= 5;
      }).length;
      const outOfStockVariants = allVariants.filter(v => {
        const total = Object.values(v.stockPerSize || {}).reduce((s, q) => s + q, 0);
        return total === 0;
      }).length;

      const [totalVariants, topCategories] = await Promise.all([
        this.variantRepository.count(),
        this.getTopCategories(),
      ]);

      return {
        totalProducts: parseInt(stats.totalProducts),
        activeProducts: parseInt(stats.activeProducts),
        featuredProducts: parseInt(stats.featuredProducts),
        onSaleProducts: parseInt(stats.onSaleProducts),
        totalVariants,
        lowStockVariants,
        outOfStockVariants,
        averageBasePrice: parseFloat(stats.averageBasePrice) || 0,
        topCategories,
        generatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Errore nel recupero product stats:', error);
      throw error;
    }
  }

  /**
   * Prodotti con best performance
   */
  async getPopularProducts(
    limit: number = 12,
    period: 'all' | 'week' | 'month' = 'all'
  ): Promise<any[]> {
    try {
      let dateFilter = '';
      if (period === 'week') dateFilter = `AND created_at >= NOW() - INTERVAL '7 days'`;
      if (period === 'month') dateFilter = `AND created_at >= NOW() - INTERVAL '30 days'`;

      const query = `
        SELECT
          id, name, base_price, is_on_sale, is_featured,
          average_rating, review_count, sales_count,
          (sales_count * 0.7 + average_rating * review_count * 0.3) as popularity_score
        FROM products
        WHERE is_active = true ${dateFilter}
        ORDER BY popularity_score DESC
        LIMIT $1
      `;

      return this.productRepository.query(query, [limit]);
    } catch (error) {
      this.logger.error('Errore nel recupero popular products:', error);
      return [];
    }
  }

  // ===========================
  // 🔧 BULK OPERATIONS
  // ===========================

  /**
   * Aggiornamento in blocco prodotti
   */
  async bulkUpdateProducts(bulkUpdateDto: BulkUpdateProductsDto): Promise<{ updated: number }> {
    const { productIds, ...updateData } = bulkUpdateDto;

    try {
      const result = await this.productRepository.update(
        { id: In(productIds) },
        updateData
      );

      this.logger.log(`📦 Aggiornamento bulk completato: ${result.affected} prodotti`);

      return { updated: result.affected || 0 };
    } catch (error) {
      this.logger.error('Errore bulk update:', error);
      throw error;
    }
  }

  // ===========================
  // 🔗 HELPER METHODS (PRIVATE)
  // ===========================

  /**
   * Prodotti correlati (stessa categoria)
   */
  private async getRelatedProducts(productId: string, limit: number = 4): Promise<Product[]> {
    try {
      const product = await this.productRepository.findOne({
        where: { id: productId },
        relations: ['category']
      });

      if (!product) return [];

      const relatedProducts = await this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.variants', 'variants')
        .where('product.id != :productId', { productId })
        .andWhere('product.isActive = :isActive', { isActive: true })
        .andWhere('category.id = :categoryId', { categoryId: product.category.id })
        .orderBy('product.salesCount', 'DESC')
        .addOrderBy('product.averageRating', 'DESC')
        .limit(limit)
        .getMany();

      return relatedProducts;
    } catch (error) {
      this.logger.warn('Errore recupero prodotti correlati:', error);
      return [];
    }
  }

  /**
   * Count prodotti in scadenza (90 giorni)
   */
  private async getExpiringSoonProductsCount(): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 90);

    return this.productRepository.count({
      where: {
        isActive: true
      },
    });
  }

  /**
   * Top 5 categorie per numero prodotti
   */
  private async getTopCategories(): Promise<any[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .select([
        'category.id as categoryId',
        'category.name as categoryName',
        'COUNT(*) as productCount'
      ])
      .where('product.isActive = true')
      .groupBy('category.id, category.name')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany();
  }

  /**
   * Top 5 brand per numero prodotti
   */
  private async getTopBrands(): Promise<any[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.brand as brand',
        'COUNT(*) as productCount'
      ])
      .where('product.isActive = true')
      .andWhere('product.brand IS NOT NULL')
      .groupBy('product.brand')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany();
  }

  /**
   * Genera slug SEO da nome
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Rimuovi accenti
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Sanitizza campi JSON per il salvataggio
   */
  private sanitizeJsonFields(createDto: CreateProductDto): any {
    const sanitized = { ...createDto } as any;

    // Key Ingredients
    if ((createDto as any).keyIngredients) {
      sanitized.keyIngredients = (createDto as any).keyIngredients.map((ingredient: any) => ({
        id: ingredient.id || this.generateUniqueId(),
        name: ingredient.name.trim(),
        description: ingredient.description?.trim(),
        image: ingredient.image,
        benefits: ingredient.benefits?.map((b: string) => b.trim()).filter(Boolean) || [],
      }));
    }

    // Product FAQs
    if ((createDto as any).productFaqs) {
      sanitized.productFaqs = (createDto as any).productFaqs.map((faq: any) => ({
        id: faq.id || this.generateUniqueId(),
        question: faq.question.trim(),
        answer: faq.answer.trim(),
        category: faq.category?.trim() || 'generale',
      }));
    }

    return sanitized;
  }

  /**
   * Genera ID unico per elementi nested
   */
  private generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse JSON field con validazione
   */
  private parseJsonField<T>(
    field: any,
    defaultValue: T,
    validator?: (data: any) => boolean
  ): T {
    if (!field) return defaultValue;

    try {
      let parsed: any;

      if (typeof field === 'string') {
        parsed = JSON.parse(field);
      } else if (Array.isArray(field) || typeof field === 'object') {
        parsed = field;
      } else {
        return defaultValue;
      }

      if (validator && !validator(parsed)) {
        this.logger.warn('JSON field validation failed, using default value');
        return defaultValue;
      }

      return parsed as T;
    } catch (error) {
      this.logger.warn(`Failed to parse JSON field: ${(error as Error).message}`);
      return defaultValue;
    }
  }

  /**
   * Converte Product entity a Response DTO.
   *
   * IMPORTANTE: il ritorno è un plain object (non un'istanza di ProductResponseDto),
   * quindi i getter della classe non vengono eseguiti automaticamente.
   * I campi calcolati (mainImage, availableSizes, availableColors, ecc.)
   * devono essere costruiti esplicitamente qui.
   */
  private convertToProductResponseDto(product: Product): any {
    const variants = product.variants || [];

    // mainImage: 1° variante isDefault  2° variante con sortOrder più basso  3° placeholder
    const sortedVariants = [...variants].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const defaultVariant = sortedVariants.find(v => v.isDefault) ?? sortedVariants[0];
    const mainImage: string = defaultVariant?.images?.[0] ?? '/assets/images/placeholder-product.jpg';

    // Tutte le taglie del prodotto (range completo definito sul prodotto)
    const sizes: string[] = product.sizes?.length ? product.sizes : [];

    // Taglie con stock disponibile aggregate da tutte le varianti attive
    const sizesWithStock = new Set<string>();
    for (const v of variants) {
      if (!v.isActive) continue;
      for (const [size, qty] of Object.entries(v.stockPerSize || {})) {
        if (qty > 0) sizesWithStock.add(size);
      }
    }
    // Rispetta l'ordine canonico di product.sizes
    const availableSizes: string[] = sizes.length
      ? sizes.filter(s => sizesWithStock.has(s))
      : [...sizesWithStock];

    // Colori disponibili con stock per taglia e signatureDetails
    const availableColors = variants
      .filter(v => v.isActive)
      .map(v => ({
        name: v.colorName,
        hex: v.colorHex,
        images: v.images ?? [],
        stockPerSize: v.stockPerSize ?? {},
        availableSizes: Object.entries(v.stockPerSize ?? {})
          .filter(([, qty]) => qty > 0)
          .map(([size]) => size),
        signatureDetails: v.signatureDetails ?? [],
      }));

    // Mappa varianti nel formato VariantResponseDto
    const variantDtos = variants.map(v => ({
      ...v,
      totalStock: Object.values(v.stockPerSize || {}).reduce((sum, qty) => sum + qty, 0),
      availableSizes: Object.entries(v.stockPerSize || {})
        .filter(([, qty]) => qty > 0)
        .map(([size]) => size),
    }));

    return {
      ...product,
      variants: variantDtos,
      mainImage,
      sizes,
      availableSizes,
      availableColors,
      handle: product.slug,
      isInStock: variants.some(v => v.isActive && v.totalStock > 0),
    };
  }

  /**
   * Applica filtri dinamici alla query
   */
  private applyFilters(query: any, filters?: ProductFilterDto): void {
    if (!filters) return;

    if (filters.query) {
      query.andWhere(
        '(LOWER(product.name) LIKE LOWER(:query) OR LOWER(product.description) LIKE LOWER(:query))',
        { query: `%${filters.query}%` },
      );
    }

    if (filters.minPrice !== undefined) {
      query.andWhere('product.basePrice >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters.maxPrice !== undefined) {
      query.andWhere('product.basePrice <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    if (filters.inStockOnly) {
      // stockPerSize è JSONB: filtra varianti con almeno una taglia con qty > 0
      query.andWhere(`variants.stockPerSize != '{}'`);
    }

    if (filters.onSaleOnly) {
      query.andWhere('product.isOnSale = :onSale', { onSale: true });
    }

    if (filters.featuredOnly) {
      query.andWhere('product.isFeatured = :featured', { featured: true });
    }

    if (typeof filters.minRating === 'number') {
      query.andWhere('product.averageRating >= :minRating', {
        minRating: filters.minRating
      });
    }

    if (filters.size) {
      // Filtra varianti che hanno stock > 0 per la taglia richiesta
      query.andWhere(`(variants.stockPerSize ->> :size)::int > 0`, { size: filters.size });
    }

    if (filters.color) {
      query.andWhere('LOWER(variants.colorName) LIKE LOWER(:color)', { color: `%${filters.color}%` });
    }
  }

  /**
   * Applica ordinamento alla query
   */
  private applySorting(query: any, filters?: ProductFilterDto): void {
    if (!filters?.sortBy) {
      query.orderBy('product.createdAt', 'DESC');
      return;
    }

    const sortOrder = filters.sortOrder || 'DESC';

    switch (filters.sortBy) {
      case 'basePrice':
        query.orderBy('product.basePrice', sortOrder);
        break;
      case 'rating':
        query.orderBy('product.averageRating', sortOrder);
        break;
      case 'sales':
        query.orderBy('product.salesCount', sortOrder);
        break;
      case 'name':
        query.orderBy('product.name', sortOrder);
        break;
      case 'newest':
      default:
        query.orderBy('product.createdAt', sortOrder);
        break;
    }
  }
}
