import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from 'src/database/entities/category.entity';
import { Product } from 'src/database/entities/product.entity';
import { Repository, Like, EntityManager } from 'typeorm';
import { ProductFilterDto, ProductListResponseDto, SearchSuggestionsResponseDto } from './dto/product.dto';

@Injectable()
export class ProductsPublicService {
  private readonly logger = new Logger(ProductsPublicService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) { }

  // ===========================
  // LISTA PRODOTTI CON FILTRI (PRIORITÀ CRITICA)
  // ===========================
  async listProducts(filters: ProductFilterDto): Promise<ProductListResponseDto> {
    try {
      const qb = this.productRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.isActive = true');

      // Applica filtri dinamici
      this.applyFilters(qb, filters);

      // Ordinamento
      this.applySorting(qb, filters);

      // Paginazione
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      qb.skip((page - 1) * limit).take(limit);

      const [rows, total] = await qb.getManyAndCount();

      this.logger.debug(`Lista prodotti: ${rows.length}/${total} trovati (pagina ${page})`);

      return {
        products: rows.map(p => this.mapProduct(p)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      };
    } catch (error) {
      this.logger.error('Errore nel recupero lista prodotti:', error);
      throw error;
    }
  }

  // ===========================
  // RICERCA E AUTOCOMPLETE
  // ===========================

  /**
   * Ricerca avanzata (riusa listProducts)
   */
  async advancedSearch(filters: ProductFilterDto): Promise<ProductListResponseDto> {
    return this.listProducts(filters);
  }

  /**
   * Quick search per autocomplete
   * Ritorna: prodotti, categorie, colori
   */
  async quickSearch(query: string, limit: number): Promise<SearchSuggestionsResponseDto> {
    if (!query || query.length < 2) {
      return { products: [], categories: [], colors: [], sizes: [] };
    }

    try {
      const searchQuery = `%${query.toLowerCase()}%`;

      // Prodotti
      const products = await this.productRepo.find({
        where: [{ name: Like(searchQuery), isActive: true }],
        take: limit,
        order: { salesCount: 'DESC' }
      });

      // Categorie
      const categories = await this.categoryRepo.find({
        where: { name: Like(searchQuery), isActive: true },
        take: limit
      });

      // Colori unici dalle varianti
      const colorsRaw = await this.productRepo.manager
        .createQueryBuilder()
        .select(['v.color_name AS "colorName"', 'v.color_hex AS "colorHex"'])
        .from('product_variants', 'v')
        .where('v.is_active = true')
        .andWhere('LOWER(v.color_name) LIKE LOWER(:q)', { q: searchQuery })
        .groupBy('v.color_name, v.color_hex')
        .limit(limit)
        .getRawMany();

      return {
        products: products.map(p => p.name),
        categories: categories.map(c => c.name),
        colors: colorsRaw.map(c => ({ name: c.colorName, hex: c.colorHex })),
        sizes: [],
      };
    } catch (error) {
      this.logger.error('Errore quick search:', error);
      return { products: [], categories: [], colors: [], sizes: [] };
    }
  }

  // ===========================
  // DETTAGLIO PRODOTTO
  // ===========================

  /**
   * Dettaglio prodotto per ID
   */
  async getProduct(id: string) {
    const product = await this.productRepo.findOne({
      where: { id, isActive: true },
      relations: ['category', 'variants']
    });

    if (!product) {
      throw new NotFoundException(`Prodotto con ID ${id} non trovato o non disponibile`);
    }

    return this.mapProduct(product, true);
  }

  /**
   * Dettaglio prodotto per slug (SEO)
   */
  async getProductBySlug(slug: string) {
    const product = await this.productRepo.findOne({
      where: { slug, isActive: true },
      relations: ['category', 'variants'],
    });

    if (!product) {
      throw new NotFoundException(`Prodotto con slug "${slug}" non trovato`);
    }

    return this.mapProduct(product, true);
  }

  // ===========================
  // DISCOVERY ENDPOINTS
  // ===========================

  /**
   * Prodotti in evidenza
   */
  async getFeatured(limit: number) {
    try {
      const products = await this.productRepo.find({
        where: { isActive: true, isFeatured: true },
        order: { salesCount: 'DESC' },
        take: limit,
        relations: ['category', 'variants']
      });

      return {
        products: products.map(p => this.mapProduct(p)),
        total: products.length
      };
    } catch (error) {
      this.logger.error('Errore nel recupero featured products:', error);
      return { products: [], total: 0 };
    }
  }

  /**
   * Prodotti in offerta
   */
  async getOnSale(limit: number) {
    try {
      const products = await this.productRepo.find({
        where: { isActive: true, isOnSale: true },
        order: { basePrice: 'ASC' },
        take: limit,
        relations: ['category', 'variants']
      });

      return { products: products.map(p => this.mapProduct(p)) };
    } catch (error) {
      this.logger.error('Errore nel recupero on-sale products:', error);
      return { products: [] };
    }
  }

  /**
   * Nuovi arrivi
   */
  async getNewArrivals(limit: number) {
    try {
      const products = await this.productRepo.find({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
        take: limit,
        relations: ['category', 'variants']
      });

      return products.map(p => this.mapProduct(p));
    } catch (error) {
      this.logger.error('Errore nel recupero new arrivals:', error);
      return [];
    }
  }

  /**
   * Prodotti popolari
   */
  async getPopular(limit: number) {
    try {
      const products = await this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.isActive = true')
        .orderBy('(p.salesCount * 0.7 + p.averageRating * p.reviewCount * 0.3)', 'DESC')
        .limit(limit)
        .getMany();

      return { products: products.map(p => this.mapProduct(p)) };
    } catch (error) {
      this.logger.error('Errore nel recupero popular products:', error);
      return { products: [] };
    }
  }

  /**
   * Trend prodotti per periodo
   */
  async getTrends(period: 'week' | 'month' | 'year') {
    try {
      const daysMap: Record<string, number> = { week: 7, month: 30, year: 365 };
      const threshold = new Date(Date.now() - daysMap[period] * 86400000);

      const products = await this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.isActive = true')
        .andWhere('p.createdAt >= :threshold', { threshold })
        .orderBy('p.salesCount', 'DESC')
        .addOrderBy('p.averageRating', 'DESC')
        .limit(10)
        .getMany();

      return {
        period,
        products: products.map(p => this.mapProduct(p)),
        generated_at: new Date()
      };
    } catch (error) {
      this.logger.error('Errore nel recupero trends:', error);
      return { period, products: [], generated_at: new Date() };
    }
  }

  // ===========================
  // FILTRI PER CATEGORIA
  // ===========================

  /**
   * Prodotti per tipo abbigliamento
   */
  async getByCosmeticType(
    cosmeticType: string,
    opts: { page?: number; limit?: number }
  ) {
    try {
      const qb = this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.isActive = true')
        .andWhere('c.clothingType = :ct', { ct: cosmeticType });

      const page = opts.page || 1;
      const limit = opts.limit || 20;
      qb.skip((page - 1) * limit).take(limit);

      const [rows, total] = await qb.getManyAndCount();

      return {
        products: rows.map(p => this.mapProduct(p)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error(`Errore recupero prodotti per categoria ${cosmeticType}:`, error);
      throw error;
    }
  }

  /**
   * Prodotti per categoria ID
   */
  async getByBrand(
    categoryId: string,
    opts: { page?: number; limit?: number }
  ) {
    try {
      const qb = this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.isActive = true')
        .andWhere('p.categoryId = :categoryId', { categoryId });

      const page = opts.page || 1;
      const limit = opts.limit || 20;
      qb.skip((page - 1) * limit).take(limit);

      const [rows, total] = await qb.getManyAndCount();

      return {
        products: rows.map(p => this.mapProduct(p)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error(`Errore recupero prodotti per categoria ${categoryId}:`, error);
      throw error;
    }
  }

  // ===========================
  // PRODOTTI CORRELATI
  // ===========================

  /**
   * Prodotti correlati (stessa categoria)
   */
  async getRelated(id: string, limit: number) {
    try {
      const base = await this.productRepo.findOne({
        where: { id },
        relations: ['category']
      });

      if (!base) {
        return { products: [] };
      }

      const products = await this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.category', 'c')
        .leftJoinAndSelect('p.variants', 'v')
        .where('p.id != :id', { id })
        .andWhere('p.isActive = true')
        .andWhere('c.id = :cid', { cid: base.category.id })
        .orderBy('p.salesCount', 'DESC')
        .limit(limit)
        .getMany();

      return { products: products.map(p => this.mapProduct(p)) };
    } catch (error) {
      this.logger.error(`Errore recupero prodotti correlati per ${id}:`, error);
      return { products: [] };
    }
  }

  // ===========================
  // FILTRI DISPONIBILI
  // ===========================

  /**
   * Opzioni filtri per sidebar
   */
  async getAvailableFilters() {
    try {
      // Range prezzi
      const priceRange = await this.productRepo
        .createQueryBuilder('p')
        .select('MIN(p.basePrice)', 'min')
        .addSelect('MAX(p.basePrice)', 'max')
        .where('p.isActive = true')
        .getRawOne();

      // Taglie distinte dalle varianti
      const sizesRaw = await this.productRepo.manager
        .createQueryBuilder()
        .select('DISTINCT v.size', 'size')
        .from('product_variants', 'v')
        .where('v.is_active = true')
        .orderBy('size', 'ASC')
        .getRawMany();

      // Colori distinti dalle varianti
      const colorsRaw = await this.productRepo.manager
        .createQueryBuilder()
        .select(['v.color_name AS "colorName"', 'v.color_hex AS "colorHex"'])
        .from('product_variants', 'v')
        .where('v.is_active = true')
        .groupBy('v.color_name, v.color_hex')
        .orderBy('"colorName"', 'ASC')
        .getRawMany();

      return {
        priceRange: {
          min: parseFloat(priceRange?.min) || 0,
          max: parseFloat(priceRange?.max) || 0
        },
        sizes: sizesRaw.map(s => s.size).filter(Boolean),
        colors: colorsRaw.map(c => ({ name: c.colorName, hex: c.colorHex })),
        fits: [],
        materials: []
      };
    } catch (error) {
      this.logger.error('Errore nel recupero filtri disponibili:', error);
      return {
        priceRange: { min: 0, max: 0 },
        sizes: [],
        colors: [],
        fits: [],
        materials: []
      };
    }
  }

  // ===========================
  // HELPER METHODS
  // ===========================

  /**
   * Applica filtri dinamici alla query
   */
  private applyFilters(qb: any, filters: ProductFilterDto): void {
    // Ricerca testuale
    if (filters.query) {
      qb.andWhere(
        '(LOWER(p.name) LIKE LOWER(:q) OR LOWER(p.description) LIKE LOWER(:q) OR LOWER(p.materials) LIKE LOWER(:q))',
        { q: `%${filters.query}%` }
      );
    }

    // Filtro tipo abbigliamento
    if (filters.clothingType) {
      qb.andWhere('c.clothingType = :clothingType', { clothingType: filters.clothingType });
    }

    // Range prezzi
    if (filters.minPrice !== undefined) {
      qb.andWhere('p.basePrice >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters.maxPrice !== undefined) {
      qb.andWhere('p.basePrice <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    // Filtro taglia (dalla variante)
    if (filters.size) {
      qb.andWhere('v.size = :size', { size: filters.size });
    }

    // Filtro colore (dalla variante)
    if (filters.color) {
      qb.andWhere('LOWER(v.colorName) LIKE LOWER(:color)', { color: `%${filters.color}%` });
    }

    // Filtro vestibilità
    if (filters.fit) {
      qb.andWhere('p.fit = :fit', { fit: filters.fit });
    }

    // Filtro materiali
    if (filters.materials) {
      qb.andWhere('LOWER(p.materials) LIKE LOWER(:materials)', { materials: `%${filters.materials}%` });
    }

    // Filtri boolean
    if (filters.inStockOnly) {
      qb.andWhere('(v.stock - v.reservedStock) > 0');
    }
    if (filters.featuredOnly) {
      qb.andWhere('p.isFeatured = true');
    }
    if (filters.onSaleOnly) {
      qb.andWhere('p.isOnSale = true');
    }

    // Rating minimo
    if (filters.minRating) {
      qb.andWhere('p.averageRating >= :mr', { mr: filters.minRating });
    }
  }

  /**
   * Applica ordinamento alla query
   */
  private applySorting(qb: any, filters: ProductFilterDto): void {
    const sortBy = filters.sortBy || 'newest';
    const sortOrder = filters.sortOrder || 'DESC';

    switch (sortBy) {
      case 'basePrice':
        qb.orderBy('p.basePrice', sortOrder);
        break;
      case 'rating':
        qb.orderBy('p.averageRating', sortOrder);
        break;
      case 'sales':
        qb.orderBy('p.salesCount', sortOrder);
        break;
      case 'name':
        qb.orderBy('p.name', sortOrder);
        break;
      case 'newest':
      default:
        qb.orderBy('p.createdAt', sortOrder);
        break;
    }
  }

  /**
   * Mappa entity Product a response DTO
   */
  private mapProduct(p: Product, detailed = false): any {
    const totalStock = p.variants?.reduce((s, v) => s + v.availableStock, 0) ?? 0;
    const mainImage = p.variants?.[0]?.images?.[0] ?? '/assets/images/placeholder-product.jpg';

    const base = {
      id: p.id,
      name: p.name,
      description: p.description,
      basePrice: p.basePrice,
      materials: p.materials,
      fit: p.fit,
      origin: p.origin,
      careInstructions: p.careInstructions,
      productLine: p.productLine,
      isActive: p.isActive,
      slug: p.slug,
      isFeatured: p.isFeatured,
      isOnSale: p.isOnSale,
      category: p.category,
      averageRating: p.averageRating,
      reviewCount: p.reviewCount,
      salesCount: p.salesCount,
      variants: p.variants,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,

      // Computed fields
      isInStock: totalStock > 0,
      totalStock,
      lowestPrice: p.basePrice,
      mainImage,
    };

    if (detailed) {
      return {
        ...base,
      };
    }

    return base;
  }

  /**
   * Trova prodotto acquistabile (usato da OrdersService)
   */
  async findPurchasableItem(itemId: string, manager?: EntityManager): Promise<Product> {
    const repo = manager
      ? manager.getRepository(Product)
      : this.productRepo;

    const product = await repo.findOne({ where: { id: itemId } });

    if (!product) {
      throw new NotFoundException(`Prodotto con ID ${itemId} non trovato`);
    }

    return product;
  }
}
