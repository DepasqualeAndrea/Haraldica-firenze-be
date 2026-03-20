import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { Coupon, CouponStatus, CouponType } from 'src/database/entities/coupon.entity';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import {
  CreateCouponDto,
  UpdateCouponDto,
  CouponFilterDto,
  ValidateCouponDto,
  CouponValidationResultDto,
  CouponUsageSummaryDto,
  CouponResponseDto,
  PaginatedCouponsResponseDto,
  BulkCreateCouponsDto,
  BulkDeleteCouponsDto,
  CollaboratorStatsDto,
} from './dto/coupon.dto';

@Injectable()
export class CouponsAdminService {
  private readonly logger = new Logger(CouponsAdminService.name);

  constructor(
    @InjectRepository(Coupon) private readonly couponsRepo: Repository<Coupon>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
  ) {}

  // ==================== CRUD ====================

  async create(dto: CreateCouponDto): Promise<CouponResponseDto> {
    this.logger.log(`Creating coupon with DTO: ${JSON.stringify(dto)}`);
    // Verifica codice univoco
    const existing = await this.couponsRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Coupon con codice "${dto.code}" già esistente`);
    }

    // Validazione date
    const validFrom = dto.startDate ? new Date(dto.startDate) : new Date();
    const validUntil = new Date(dto.endDate);
    if (validUntil <= validFrom) {
      throw new BadRequestException('La data di fine validità deve essere successiva alla data di inizio');
    }

    // Validazione percentuale max 100
    if (dto.type === CouponType.PERCENTAGE && dto.value > 100) {
      throw new BadRequestException('Il valore percentuale non può superare 100');
    }

    const coupon = this.couponsRepo.create({
      ...dto,
      validFrom,
      validUntil,
      usageLimit: dto.maxRedemptions,
      status: dto.status || CouponStatus.ACTIVE,
      usedCount: 0,
    });

    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon creato: ${saved.code} (${saved.id})`);

    return this.toResponseDto(saved);
  }

  async findAll(filter: CouponFilterDto): Promise<PaginatedCouponsResponseDto> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;
    const sortBy = filter.sortBy || 'createdAt';
    const sortOrder = filter.sortOrder || 'DESC';

    const qb = this.couponsRepo.createQueryBuilder('c');

    // Filtri
    if (filter.type) {
      qb.andWhere('c.type = :type', { type: filter.type });
    }
    if (filter.status) {
      qb.andWhere('c.status = :status', { status: filter.status });
    }
    if (filter.collaborator) {
      qb.andWhere('c.collaborator ILIKE :collaborator', { collaborator: `%${filter.collaborator}%` });
    }
    if (filter.search) {
      qb.andWhere('(c.code ILIKE :search OR c.name ILIKE :search)', { search: `%${filter.search}%` });
    }
    if (filter.activeOnly) {
      const now = new Date();
      qb.andWhere('c.status = :activeStatus', { activeStatus: CouponStatus.ACTIVE })
        .andWhere('c.validFrom <= :now', { now })
        .andWhere('c.validUntil >= :now', { now })
        .andWhere('(c.usageLimit IS NULL OR c.usedCount < c.usageLimit)');
    }

    // Ordinamento
    const validSortFields = ['createdAt', 'code', 'usedCount', 'validUntil', 'value', 'name'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`c.${orderField}`, sortOrder);

    // Paginazione
    qb.skip(skip).take(limit);

    const [coupons, total] = await qb.getManyAndCount();

    return {
      data: coupons.map(c => this.toResponseDto(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<CouponResponseDto> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }
    return this.toResponseDto(coupon);
  }

  async findByCode(code: string): Promise<CouponResponseDto> {
    const coupon = await this.couponsRepo.findOne({ where: { code: code.toUpperCase() } });
    if (!coupon) {
      throw new NotFoundException(`Coupon "${code}" non trovato`);
    }
    return this.toResponseDto(coupon);
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponResponseDto> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }

    // Se cambio codice, verifico che non esista già
    if (dto.code && dto.code !== coupon.code) {
      const existing = await this.couponsRepo.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException(`Coupon con codice "${dto.code}" già esistente`);
      }
    }

    // Validazione date
    const validFrom = dto.startDate ? new Date(dto.startDate) : coupon.validFrom;
    const validUntil = dto.endDate ? new Date(dto.endDate) : coupon.validUntil;
    if (validUntil <= validFrom) {
      throw new BadRequestException('La data di fine validità deve essere successiva alla data di inizio');
    }

    // Validazione percentuale
    const type = dto.type || coupon.type;
    const value = dto.value ?? coupon.value;
    if (type === CouponType.PERCENTAGE && value > 100) {
      throw new BadRequestException('Il valore percentuale non può superare 100');
    }

    Object.assign(coupon, {
      ...dto,
      validFrom: dto.startDate ? new Date(dto.startDate) : coupon.validFrom,
      validUntil: dto.endDate ? new Date(dto.endDate) : coupon.validUntil,
      usageLimit: dto.maxRedemptions,
    });

    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon aggiornato: ${saved.code} (${saved.id})`);

    return this.toResponseDto(saved);
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }

    // Verifica se è stato usato
    if (coupon.usedCount > 0) {
      // Invece di eliminare, disattiva
      coupon.status = CouponStatus.INACTIVE;
      await this.couponsRepo.save(coupon);
      return { success: true, message: `Coupon "${coupon.code}" disattivato (ha ${coupon.usedCount} utilizzi)` };
    }

    await this.couponsRepo.remove(coupon);
    this.logger.log(`Coupon eliminato: ${coupon.code}`);

    return { success: true, message: `Coupon "${coupon.code}" eliminato` };
  }

  // ==================== BULK OPERATIONS ====================

  async bulkCreate(dto: BulkCreateCouponsDto): Promise<{ created: number; errors: string[] }> {
    const results = { created: 0, errors: [] as string[] };

    for (const couponDto of dto.coupons) {
      try {
        await this.create(couponDto);
        results.created++;
      } catch (error) {
        results.errors.push(`${couponDto.code}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk create: ${results.created} creati, ${results.errors.length} errori`);
    return results;
  }

  async bulkDelete(dto: BulkDeleteCouponsDto): Promise<{ deleted: number; deactivated: number; errors: string[] }> {
    const results = { deleted: 0, deactivated: 0, errors: [] as string[] };

    for (const id of dto.ids) {
      try {
        const result = await this.delete(id);
        if (result.message.includes('disattivato')) {
          results.deactivated++;
        } else {
          results.deleted++;
        }
      } catch (error) {
        results.errors.push(`${id}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk delete: ${results.deleted} eliminati, ${results.deactivated} disattivati`);
    return results;
  }

  // ==================== STATUS MANAGEMENT ====================

  async activate(id: string): Promise<CouponResponseDto> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }

    coupon.status = CouponStatus.ACTIVE;
    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon attivato: ${saved.code}`);

    return this.toResponseDto(saved);
  }

  async deactivate(id: string): Promise<CouponResponseDto> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }

    coupon.status = CouponStatus.INACTIVE;
    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon disattivato: ${saved.code}`);

    return this.toResponseDto(saved);
  }

  // ==================== VALIDATION ====================

  async validate(dto: ValidateCouponDto): Promise<CouponValidationResultDto> {
    const coupon = await this.couponsRepo.findOne({ where: { code: dto.code } });

    if (!coupon) {
      return { valid: false, errorCode: 'NOT_FOUND', errorMessage: 'Coupon non trovato' };
    }

    const now = new Date();

    // Check status
    if (coupon.status !== CouponStatus.ACTIVE) {
      return { valid: false, errorCode: 'INACTIVE', errorMessage: 'Coupon non attivo' };
    }

    // Check date validity
    if (now < coupon.validFrom) {
      return { valid: false, errorCode: 'NOT_YET_VALID', errorMessage: 'Coupon non ancora valido' };
    }
    if (now > coupon.validUntil) {
      return { valid: false, errorCode: 'EXPIRED', errorMessage: 'Coupon scaduto' };
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, errorCode: 'USAGE_LIMIT_REACHED', errorMessage: 'Limite utilizzi raggiunto' };
    }

    // Check minimum order amount
    if (dto.orderTotal !== undefined && coupon.minimumOrderAmount) {
      if (dto.orderTotal < coupon.minimumOrderAmount) {
        return {
          valid: false,
          errorCode: 'MINIMUM_NOT_MET',
          errorMessage: `Ordine minimo: €${coupon.minimumOrderAmount.toFixed(2)}`,
        };
      }
    }

    // Check user usage limit
    if (dto.userId && coupon.usageLimitPerUser) {
      const userUsageCount = await this.ordersRepo.count({
        where: {
          userId: dto.userId,
          couponCode: coupon.code,
          status: In([OrderStatus.CONFIRMED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.SHIPPED]),
        },
      });

      if (userUsageCount >= coupon.usageLimitPerUser) {
        return { valid: false, errorCode: 'USER_LIMIT_REACHED', errorMessage: 'Hai già usato questo coupon' };
      }
    }

    // Check first order only
    if (coupon.isFirstOrderOnly && dto.userId) {
      const previousOrders = await this.ordersRepo.count({
        where: {
          userId: dto.userId,
          status: In([OrderStatus.CONFIRMED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.SHIPPED]),
        },
      });

      if (previousOrders > 0 && !dto.isFirstOrder) {
        return { valid: false, errorCode: 'FIRST_ORDER_ONLY', errorMessage: 'Valido solo per il primo ordine' };
      }
    }

    // Check applicable products/categories
    if (dto.productIds?.length && coupon.applicableProducts?.length) {
      const hasApplicableProduct = dto.productIds.some(id => coupon.applicableProducts.includes(id));
      if (!hasApplicableProduct) {
        return { valid: false, errorCode: 'NOT_APPLICABLE', errorMessage: 'Coupon non applicabile a questi prodotti' };
      }
    }

    if (dto.categoryIds?.length && coupon.applicableCategories?.length) {
      const hasApplicableCategory = dto.categoryIds.some(id => coupon.applicableCategories.includes(id));
      if (!hasApplicableCategory) {
        return { valid: false, errorCode: 'NOT_APPLICABLE', errorMessage: 'Coupon non applicabile a queste categorie' };
      }
    }

    // Check excluded products/categories
    if (dto.productIds?.length && coupon.excludedProducts?.length) {
      const hasExcludedProduct = dto.productIds.some(id => coupon.excludedProducts.includes(id));
      if (hasExcludedProduct) {
        return { valid: false, errorCode: 'EXCLUDED_PRODUCT', errorMessage: 'Alcuni prodotti sono esclusi da questo coupon' };
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (dto.orderTotal !== undefined) {
      switch (coupon.type) {
        case CouponType.PERCENTAGE:
          discountAmount = (dto.orderTotal * coupon.value) / 100;
          if (coupon.maximumDiscountAmount) {
            discountAmount = Math.min(discountAmount, coupon.maximumDiscountAmount);
          }
          break;
        case CouponType.FIXED_AMOUNT:
          discountAmount = Math.min(coupon.value, dto.orderTotal);
          break;
        case CouponType.FREE_SHIPPING:
          discountAmount = 0; // Lo sconto spedizione va gestito separatamente
          break;
      }
    }

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        value: coupon.value,
        minimumOrderAmount: coupon.minimumOrderAmount,
        maximumDiscountAmount: coupon.maximumDiscountAmount,
      },
      discountAmount: Math.round(discountAmount * 100) / 100,
    };
  }

  // ==================== STATISTICS ====================

  async getStats(id: string): Promise<CouponUsageSummaryDto> {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon con ID "${id}" non trovato`);
    }

    const validStatuses = [OrderStatus.CONFIRMED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

    const stats = await this.ordersRepo
      .createQueryBuilder('o')
      .select([
        'COUNT(*)::int AS "totalOrders"',
        'COALESCE(SUM(o.total), 0)::numeric AS "totalRevenue"',
        'COALESCE(SUM(o.discountAmount), 0)::numeric AS "totalDiscount"',
      ])
      .where('o.couponCode = :code', { code: coupon.code })
      .andWhere('o.status IN (:...statuses)', { statuses: validStatuses })
      .getRawOne<{ totalOrders: number; totalRevenue: string; totalDiscount: string }>();

    const totalOrders = Number(stats?.totalOrders ?? 0);
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const totalDiscount = Number(stats?.totalDiscount ?? 0);
    const netRevenue = totalRevenue - totalDiscount;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      collaborator: coupon.collaborator,
      totalUses: coupon.usedCount,
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      usageLimit: coupon.usageLimit,
      remainingUses: coupon.usageLimit ? coupon.usageLimit - coupon.usedCount : null,
      conversionRate: totalOrders > 0 ? 100 : 0,
    };
  }

  async getCollaboratorStats(): Promise<CollaboratorStatsDto[]> {
    const coupons = await this.couponsRepo.find({
      where: { collaborator: ILike('%') }, // Solo coupon con collaboratore
    });

    // Raggruppa per collaboratore
    const collaboratorMap = new Map<string, Coupon[]>();
    for (const coupon of coupons) {
      if (coupon.collaborator) {
        const existing = collaboratorMap.get(coupon.collaborator) || [];
        existing.push(coupon);
        collaboratorMap.set(coupon.collaborator, existing);
      }
    }

    const results: CollaboratorStatsDto[] = [];
    const validStatuses = [OrderStatus.CONFIRMED, OrderStatus.DELIVERED, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

    for (const [collaborator, collabCoupons] of collaboratorMap) {
      const codes = collabCoupons.map(c => c.code);

      const stats = await this.ordersRepo
        .createQueryBuilder('o')
        .select([
          'COUNT(*)::int AS "totalOrders"',
          'COALESCE(SUM(o.total), 0)::numeric AS "totalRevenue"',
          'COALESCE(SUM(o.discountAmount), 0)::numeric AS "totalDiscount"',
        ])
        .where('o.couponCode IN (:...codes)', { codes })
        .andWhere('o.status IN (:...statuses)', { statuses: validStatuses })
        .getRawOne<{ totalOrders: number; totalRevenue: string; totalDiscount: string }>();

      const totalRevenue = Number(stats?.totalRevenue ?? 0);
      const totalDiscount = Number(stats?.totalDiscount ?? 0);

      results.push({
        collaborator,
        totalCoupons: collabCoupons.length,
        totalUses: collabCoupons.reduce((sum, c) => sum + c.usedCount, 0),
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        netRevenue: Math.round((totalRevenue - totalDiscount) * 100) / 100,
        couponCodes: codes,
      });
    }

    // Ordina per revenue decrescente
    results.sort((a, b) => b.netRevenue - a.netRevenue);

    return results;
  }

  async getDashboardStats(): Promise<{
    totalCoupons: number;
    activeCoupons: number;
    totalUses: number;
    totalDiscount: number;
    topCoupons: { code: string; uses: number; revenue: number }[];
    recentCoupons: CouponResponseDto[];
  }> {
    const totalCoupons = await this.couponsRepo.count();

    const activeCoupons = await this.couponsRepo.count({
      where: {
        status: CouponStatus.ACTIVE,
      },
    });

    const usageStats = await this.couponsRepo
      .createQueryBuilder('c')
      .select('SUM(c.usedCount)', 'totalUses')
      .getRawOne<{ totalUses: string }>();

    const discountStats = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.discountAmount), 0)', 'totalDiscount')
      .where('o.couponCode IS NOT NULL')
      .getRawOne<{ totalDiscount: string }>();

    // Top 5 coupon per utilizzi
    const topCoupons = await this.couponsRepo
      .createQueryBuilder('c')
      .select(['c.code', 'c.usedCount'])
      .orderBy('c.usedCount', 'DESC')
      .limit(5)
      .getMany();

    // Ultimi 5 coupon creati
    const recentCoupons = await this.couponsRepo.find({
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      totalCoupons,
      activeCoupons,
      totalUses: Number(usageStats?.totalUses ?? 0),
      totalDiscount: Math.round(Number(discountStats?.totalDiscount ?? 0) * 100) / 100,
      topCoupons: topCoupons.map(c => ({ code: c.code, uses: c.usedCount, revenue: 0 })),
      recentCoupons: recentCoupons.map(c => this.toResponseDto(c)),
    };
  }

  // ==================== HELPERS ====================

  private toResponseDto(coupon: Coupon): CouponResponseDto {
    const now = new Date();
    const isCurrentlyValid =
      coupon.status === CouponStatus.ACTIVE &&
      now >= coupon.validFrom &&
      now <= coupon.validUntil &&
      (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit);

    return {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
      minimumOrderAmount: coupon.minimumOrderAmount,
      maximumDiscountAmount: coupon.maximumDiscountAmount,
      usageLimit: coupon.usageLimit,
      usageLimitPerUser: coupon.usageLimitPerUser,
      usedCount: coupon.usedCount,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      status: coupon.status,
      applicableProducts: coupon.applicableProducts,
      applicableCategories: coupon.applicableCategories,
      excludedProducts: coupon.excludedProducts,
      excludedCategories: coupon.excludedCategories,
      isFirstOrderOnly: coupon.isFirstOrderOnly,
      collaborator: coupon.collaborator,
      internalNotes: coupon.internalNotes,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
      isCurrentlyValid,
    };
  }
}
