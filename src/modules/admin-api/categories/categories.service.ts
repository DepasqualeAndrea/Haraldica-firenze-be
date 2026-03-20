import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToClass } from "class-transformer";
import { Category } from "src/database/entities/category.entity";
import { Product } from "src/database/entities/product.entity";
import { SizeGuide, SizeSystem } from "src/database/entities/size-guide.entity";
import { Repository, IsNull, Not } from "typeorm";
import { CategoryFilterDto } from "./dto/category-filter.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { CategoryResponseDto, CategoryListResponseDto, CategoryTreeResponseDto, CategoryStatsResponseDto } from "./dto/response.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(SizeGuide)
    private sizeGuideRepository: Repository<SizeGuide>,
  ) {}

  // ===========================
  // CORE CRUD OPERATIONS
  // ===========================

  async create(createCategoryDto: CreateCategoryDto): Promise<CategoryResponseDto> {
    // Verifica slug univoco
    await this.validateUniqueSlug(createCategoryDto.slug);

    // Verifica categoria padre se specificata (ignora stringa vuota)
    if (createCategoryDto.parentId && createCategoryDto.parentId.trim() !== '') {
      await this.validateParentCategory(createCategoryDto.parentId);
    }

    // Auto-genera metaTitle e metaDescription se non forniti
    // Pulisci parentId se è stringa vuota (per evitare errori UUID)
    const categoryData = {
      ...createCategoryDto,
      parentId: createCategoryDto.parentId && createCategoryDto.parentId.trim() !== ''
        ? createCategoryDto.parentId
        : null,
      metaTitle: createCategoryDto.metaTitle || this.generateMetaTitle(createCategoryDto.name),
      metaDescription: createCategoryDto.metaDescription || this.generateMetaDescription(createCategoryDto.name, createCategoryDto.description),
    };

    const category = this.categoryRepository.create(categoryData);
    const savedCategory = await this.categoryRepository.save(category);

    this.logger.log(`Categoria creata: ${savedCategory.name} (${savedCategory.slug})`);

    return this.findOneDetailed(savedCategory.id);
  }

  async findAll(filterDto: CategoryFilterDto = {}): Promise<CategoryListResponseDto> {
    const queryBuilder = this.categoryRepository.createQueryBuilder('category');

    // Applica filtri
    this.applyFilters(queryBuilder, filterDto);

    // Include relazioni se richieste
    if (filterDto.includeChildren !== false) {
      queryBuilder.leftJoinAndSelect('category.children', 'children', 'children.isActive = :childActive', { childActive: true });
    }

    if (filterDto.includeParent !== false) {
      queryBuilder.leftJoinAndSelect('category.parent', 'parent');
    }

    if (filterDto.includeProducts) {
      queryBuilder.leftJoinAndSelect('category.products', 'products', 'products.isActive = :productActive', { productActive: true });
    }

    // Ordinamento
    queryBuilder
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC');

    const [categories, total] = await queryBuilder.getManyAndCount();

    // Aggiungi conteggio prodotti se necessario
    const categoriesWithCounts = await this.addProductCounts(categories, filterDto.includeProducts || false);

    const categoryDtos = categoriesWithCounts.map(category =>
      plainToClass(CategoryResponseDto, category, {
        excludeExtraneousValues: true,
      })
    );

    // Statistiche aggiuntive
    const rootCategories = await this.categoryRepository.count({
      where: { parentId: IsNull(), isActive: true }
    });

    const totalActiveCategories = await this.categoryRepository.count({
      where: { isActive: true }
    });

    return {
      categories: categoryDtos,
      total,
      rootCategories,
      totalActiveCategories,
    };
  }

  async findOne(id: string, options: { includeProducts?: boolean; includeChildren?: boolean; includeParent?: boolean } = {}): Promise<Category> {
    const queryBuilder = this.categoryRepository.createQueryBuilder('category')
      .where('category.id = :id', { id });

    if (options.includeChildren !== false) {
      queryBuilder.leftJoinAndSelect('category.children', 'children', 'children.isActive = :childActive', { childActive: true });
    }

    if (options.includeParent !== false) {
      queryBuilder.leftJoinAndSelect('category.parent', 'parent');
    }

    if (options.includeProducts) {
      queryBuilder.leftJoinAndSelect('category.products', 'products', 'products.isActive = :productActive', { productActive: true });
    }

    const category = await queryBuilder.getOne();

    if (!category) {
      throw new NotFoundException(`Categoria non trovata: ${id}`);
    }

    return category;
  }

  async findOneDetailed(id: string): Promise<CategoryResponseDto> {
    const category = await this.findOne(id, {
      includeProducts: false,
      includeChildren: true,
      includeParent: true
    });

    // Aggiungi conteggio prodotti
    const categoryWithCount = await this.addProductCount(category);

    return plainToClass(CategoryResponseDto, categoryWithCount, {
      excludeExtraneousValues: true,
    });
  }

  async findBySlug(slug: string, options: { includeProducts?: boolean } = {}): Promise<CategoryResponseDto> {
    const queryBuilder = this.categoryRepository.createQueryBuilder('category')
      .leftJoinAndSelect('category.children', 'children', 'children.isActive = :childActive', { childActive: true })
      .leftJoinAndSelect('category.parent', 'parent')
      .where('category.slug = :slug', { slug })
      .andWhere('category.isActive = :isActive', { isActive: true });

    if (options.includeProducts) {
      queryBuilder.leftJoinAndSelect('category.products', 'products', 'products.isActive = :productActive', { productActive: true });
    }

    const category = await queryBuilder.getOne();

    if (!category) {
      throw new NotFoundException(`Categoria non trovata con slug: ${slug}`);
    }

    const categoryWithCount = await this.addProductCount(category);

    return plainToClass(CategoryResponseDto, categoryWithCount, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.findOne(id);

    // Verifica slug univoco se modificato
    if (updateCategoryDto.slug && updateCategoryDto.slug !== category.slug) {
      await this.validateUniqueSlug(updateCategoryDto.slug, id);
    }

    // Verifica categoria padre se modificata
    if (updateCategoryDto.parentId !== undefined && updateCategoryDto.parentId !== category.parentId) {
      if (updateCategoryDto.parentId) {
        // Non può essere padre di se stessa
        if (updateCategoryDto.parentId === id) {
          throw new BadRequestException('Una categoria non può essere padre di se stessa');
        }

        await this.validateParentCategory(updateCategoryDto.parentId);

        // Verifica che non crei loop circolari
        const isCircular = await this.checkCircularReference(id, updateCategoryDto.parentId);
        if (isCircular) {
          throw new BadRequestException('Riferimento circolare non permesso');
        }
      }
    }

    Object.assign(category, updateCategoryDto);

    const updatedCategory = await this.categoryRepository.save(category);
    this.logger.log(`Categoria aggiornata: ${updatedCategory.slug}`);

    return this.findOneDetailed(updatedCategory.id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['children', 'products'],
    });

    if (!category) {
      throw new NotFoundException('Categoria non trovata');
    }

    // Verifica se ha figli attivi
    const activeChildren = category.children?.filter(child => child.isActive);
    if (activeChildren && activeChildren.length > 0) {
      throw new BadRequestException(
        `Impossibile eliminare categoria con ${activeChildren.length} sottocategorie attive. ` +
        'Disattiva prima le sottocategorie o spostale.'
      );
    }

    // Verifica se ha prodotti attivi
    const activeProducts = category.products?.filter(product => product.isActive);
    if (activeProducts && activeProducts.length > 0) {
      throw new BadRequestException(
        `Impossibile eliminare categoria con ${activeProducts.length} prodotti attivi. ` +
        'Sposta prima i prodotti in altre categorie.'
      );
    }

    await this.categoryRepository.remove(category);
    this.logger.log(`Categoria eliminata: ${category.slug}`);
  }

  // ===========================
  // TREE & HIERARCHY METHODS
  // ===========================

  async getTree(includeInactive: boolean = false): Promise<CategoryTreeResponseDto> {
    const whereCondition: any = { parentId: IsNull() };
    if (!includeInactive) {
      whereCondition.isActive = true;
    }

    const rootCategories = await this.categoryRepository.find({
      where: whereCondition,
      relations: ['children', 'children.children'], // 2 livelli di profondità
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    // Filtra categorie figlie inattive se necessario
    if (!includeInactive) {
      this.filterInactiveChildren(rootCategories);
    }

    const tree = await this.addProductCounts(rootCategories, false);
    const treeDtos = tree.map(category =>
      plainToClass(CategoryResponseDto, category, {
        excludeExtraneousValues: true,
      })
    );

    const totalCategories = await this.categoryRepository.count({
      where: includeInactive ? {} : { isActive: true }
    });

    return {
      tree: treeDtos,
      totalCategories,
      maxDepth: this.calculateMaxDepth(treeDtos),
    };
  }

  async getBreadcrumb(categoryId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
    const category = await this.findOne(categoryId, { includeParent: true });
    const breadcrumb: Array<{ id: string; name: string; slug: string }> = [];

    let current: Category | undefined = category;
    while (current) {
      breadcrumb.unshift({
        id: current.id,
        name: current.name,
        slug: current.slug,
      });
      current = current.parent;
    }

    return breadcrumb;
  }

  async moveCategory(categoryId: string, newParentId: string | null): Promise<CategoryResponseDto> {
    const category = await this.findOne(categoryId);

    if (newParentId) {
      // Validazioni per move
      if (newParentId === categoryId) {
        throw new BadRequestException('Una categoria non può essere padre di se stessa');
      }

      await this.validateParentCategory(newParentId);

      const isCircular = await this.checkCircularReference(categoryId, newParentId);
      if (isCircular) {
        throw new BadRequestException('Spostamento creerebbe riferimento circolare');
      }
    }

    category.parentId = newParentId;
    await this.categoryRepository.save(category);

    this.logger.log(`Categoria spostata: ${category.slug} → parent: ${newParentId || 'root'}`);

    return this.findOneDetailed(categoryId);
  }

  // ===========================
  // STATISTICS & ANALYTICS
  // ===========================

  async getCategoryStats(): Promise<CategoryStatsResponseDto> {
    const [
      totalCategories,
      activeCategories,
      rootCategories,
      categoriesWithProducts,
    ] = await Promise.all([
      this.categoryRepository.count(),
      this.categoryRepository.count({ where: { isActive: true } }),
      this.categoryRepository.count({ where: { parentId: IsNull() } }),
      this.categoryRepository
        .createQueryBuilder('category')
        .innerJoin('category.products', 'products', 'products.isActive = :productActive', { productActive: true })
        .getCount(),
    ]);

    // Media prodotti per categoria
    const totalProducts = await this.productRepository.count({ where: { isActive: true } });
    const averageProductsPerCategory = categoriesWithProducts > 0 ? totalProducts / categoriesWithProducts : 0;

    // Top categorie
    const topCategories = await this.getTopCategories();

    return {
      totalCategories,
      activeCategories,
      rootCategories,
      categoriesWithProducts,
      averageProductsPerCategory: Math.round(averageProductsPerCategory * 100) / 100,
      topCategories,
    };
  }

  async getTopCategories(limit: number = 10): Promise<Array<{
    id: string;
    name: string;
    productCount: number;
  }>> {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.products', 'products', 'products.isActive = :productActive', { productActive: true })
      .select([
        'category.id as id',
        'category.name as name',
        'COUNT(products.id) as productCount'
      ])
      .where('category.isActive = :isActive', { isActive: true })
      .groupBy('category.id, category.name')
      .orderBy('COUNT(products.id)', 'DESC')
      .limit(limit)
      .getRawMany();

    return categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      productCount: parseInt(cat.productCount) || 0,
    }));
  }

  // ===========================
  // BULK OPERATIONS
  // ===========================

  async bulkUpdateSortOrder(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
    for (const update of updates) {
      await this.categoryRepository.update(update.id, { sortOrder: update.sortOrder });
    }

    this.logger.log(`Bulk update sort order: ${updates.length} categorie aggiornate`);
  }

  async bulkActivate(categoryIds: string[], isActive: boolean): Promise<{ updated: number; errors: string[] }> {
    const results = { updated: 0, errors: [] as string[] };

    for (const categoryId of categoryIds) {
      try {
        await this.categoryRepository.update(categoryId, { isActive });
        results.updated++;
      } catch (error) {
        results.errors.push(`Categoria ${categoryId}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk ${isActive ? 'attivazione' : 'disattivazione'}: ${results.updated} successi, ${results.errors.length} errori`);

    return results;
  }

  // ===========================
  // SIZE GUIDE METHODS
  // ===========================

  async upsertSizeGuide(
    categoryId: string,
    dto: { title: string; rows: any[]; primarySystem?: string; notes?: string },
  ): Promise<SizeGuide> {
    // Ensure category exists
    await this.findOne(categoryId, { includeChildren: false, includeParent: false });

    const primarySystem = dto.primarySystem as SizeSystem | undefined;
    let sizeGuide = await this.sizeGuideRepository.findOne({ where: { categoryId } });

    if (sizeGuide) {
      Object.assign(sizeGuide, {
        title: dto.title,
        rows: dto.rows,
        ...(primarySystem !== undefined && { primarySystem }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      });
    } else {
      sizeGuide = this.sizeGuideRepository.create({
        categoryId,
        title: dto.title,
        rows: dto.rows,
        ...(primarySystem !== undefined && { primarySystem }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      });
    }

    const saved = await this.sizeGuideRepository.save(sizeGuide);
    this.logger.log(`SizeGuide upserted per categoria: ${categoryId}`);
    return saved;
  }

  async getSizeGuide(categoryId: string): Promise<SizeGuide | null> {
    return this.sizeGuideRepository.findOne({ where: { categoryId } });
  }

  async deleteSizeGuide(categoryId: string): Promise<void> {
    const sizeGuide = await this.sizeGuideRepository.findOne({ where: { categoryId } });
    if (!sizeGuide) {
      throw new NotFoundException(`SizeGuide non trovata per categoria: ${categoryId}`);
    }
    await this.sizeGuideRepository.remove(sizeGuide);
    this.logger.log(`SizeGuide eliminata per categoria: ${categoryId}`);
  }

  // ===========================
  // HELPER METHODS
  // ===========================

  private async validateUniqueSlug(slug: string, excludeId?: string): Promise<void> {
    const whereCondition: any = { slug };
    if (excludeId) {
      whereCondition.id = Not(excludeId);
    }

    const existingSlug = await this.categoryRepository.findOne({ where: whereCondition });
    if (existingSlug) {
      throw new ConflictException(`Slug '${slug}' già esistente`);
    }
  }

  private async validateParentCategory(parentId: string): Promise<void> {
    const parent = await this.categoryRepository.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new NotFoundException('Categoria padre non trovata');
    }
    if (!parent.isActive) {
      throw new BadRequestException('Categoria padre non attiva');
    }
  }

  private async checkCircularReference(categoryId: string, parentId: string): Promise<boolean> {
    const parent = await this.categoryRepository.findOne({
      where: { id: parentId },
      relations: ['parent'],
    });

    if (!parent) return false;
    if (parent.parentId === categoryId) return true;
    if (parent.parentId) {
      return this.checkCircularReference(categoryId, parent.parentId);
    }

    return false;
  }

  private applyFilters(queryBuilder: any, filterDto: CategoryFilterDto): void {
    if (filterDto.isActive !== undefined) {
      queryBuilder.andWhere('category.isActive = :isActive', { isActive: filterDto.isActive });
    }

    if (filterDto.parentId !== undefined) {
      if (filterDto.parentId === null || filterDto.parentId === 'null') {
        queryBuilder.andWhere('category.parentId IS NULL');
      } else {
        queryBuilder.andWhere('category.parentId = :parentId', { parentId: filterDto.parentId });
      }
    }

    if (filterDto.clothingType) {
      queryBuilder.andWhere('category.clothingType = :clothingType', { clothingType: filterDto.clothingType });
    }

    if (filterDto.hasProducts) {
      queryBuilder.innerJoin('category.products', 'hasProductsFilter', 'hasProductsFilter.isActive = :productActive', { productActive: true });
    }

    if (filterDto.search) {
      queryBuilder.andWhere(
        '(LOWER(category.name) LIKE LOWER(:search) OR LOWER(category.description) LIKE LOWER(:search))',
        { search: `%${filterDto.search}%` }
      );
    }
  }

  private async addProductCount(category: Category): Promise<Category> {
    const productCount = await this.productRepository.count({
      where: { categoryId: category.id, isActive: true }
    });

    (category as any).productCount = productCount;
    return category;
  }

  private async addProductCounts(categories: Category[], alreadyIncluded: boolean = false): Promise<Category[]> {
    if (alreadyIncluded) {
      // Se i prodotti sono già inclusi, conta direttamente
      return categories.map(category => {
        (category as any).productCount = category.products?.filter(p => p.isActive).length || 0;
        return category;
      });
    }

    // Altrimenti, fai query separate per performance
    for (const category of categories) {
      await this.addProductCount(category);
    }

    return categories;
  }

  private filterInactiveChildren(categories: Category[]): void {
    categories.forEach(category => {
      if (category.children) {
        category.children = category.children.filter(child => child.isActive);
        this.filterInactiveChildren(category.children);
      }
    });
  }

  private calculateMaxDepth(categories: CategoryResponseDto[], currentDepth: number = 1): number {
    let maxDepth = currentDepth;

    categories.forEach(category => {
      if (category.children && category.children.length > 0) {
        const childDepth = this.calculateMaxDepth(category.children, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    });

    return maxDepth;
  }

  private generateMetaTitle(name: string): string {
    return name.length <= 60 ? name : `${name.substring(0, 57)}...`;
  }

  private generateMetaDescription(name: string, description?: string): string {
    if (description && description.length <= 160) {
      return description;
    }

    const baseDesc = description ? description.substring(0, 120) : `Scopri ${name}`;
    return `${baseDesc}... Acquista online con spedizione gratuita sopra €200.`;
  }
}
