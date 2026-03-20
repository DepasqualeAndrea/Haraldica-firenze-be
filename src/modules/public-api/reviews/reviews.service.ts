import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToClass } from "class-transformer";
import { OrderItem } from "src/database/entities/order-item.entity";
import { Order, OrderStatus } from "src/database/entities/order.entity";
import { Product } from "src/database/entities/product.entity";
import { Review } from "src/database/entities/review.entity";
import { User } from "src/database/entities/user.entity";
import { Repository, Not, MoreThanOrEqual, In } from "typeorm";
import { BulkReviewActionDto } from "./dto/bulk-operations.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ReviewResponseDto, ReviewListResponseDto, ProductRatingStatsDto, ReviewStatsResponseDto } from "./dto/response.dto";
import { ReviewFilterDto } from "./dto/review-filter.dto";
import { StoreResponseDto } from "./dto/store-response.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
  ) { }

  // ===========================
  // CORE REVIEW OPERATIONS
  // ===========================

  async create(userId: string, createReviewDto: CreateReviewDto): Promise<ReviewResponseDto> {
    // Verifica che il prodotto esista e sia attivo
    const product = await this.productRepository.findOne({
      where: { id: createReviewDto.productId, isActive: true },
    });
    if (!product) {
      throw new NotFoundException('Prodotto non trovato o non attivo');
    }

    // Verifica che l'utente abbia acquistato il prodotto
    const purchaseCheck = await this.checkUserPurchase(userId, createReviewDto.productId);
    if (!purchaseCheck.hasPurchased) {
      throw new BadRequestException('Puoi recensire solo prodotti che hai acquistato e ricevuto');
    }

    // Verifica che non abbia già recensito questo prodotto
    const existingReview = await this.reviewRepository.findOne({
      where: { userId, productId: createReviewDto.productId },
    });
    if (existingReview) {
      throw new BadRequestException('Hai già recensito questo prodotto');
    }

    // Verifica ordine se specificato
    let validatedOrderId: string | undefined = createReviewDto.orderId;
    if (createReviewDto.orderId) {
      const isValidOrder = purchaseCheck.orderIds.includes(createReviewDto.orderId);
      if (!isValidOrder) {
        throw new BadRequestException('Ordine non valido o non contiene questo prodotto');
      }
    } else {
      // Usa l'ordine più recente se non specificato
      validatedOrderId = purchaseCheck.orderIds[0];
    }

    const review = this.reviewRepository.create({
      ...createReviewDto,
      userId,
      orderId: validatedOrderId,
      isVerifiedPurchase: true,
      isApproved: true, // Auto-approve per acquisti verificati
    });

    const savedReview = await this.reviewRepository.save(review);

    // Aggiorna statistiche prodotto
    await this.updateProductRatingStats(createReviewDto.productId);

    this.logger.log(`✅ Recensione creata: ${savedReview.id} per prodotto ${createReviewDto.productId} da user ${userId}`);

    return this.findOneDetailed(savedReview.id);
  }

  async findAll(filterDto: ReviewFilterDto = {}): Promise<ReviewListResponseDto> {
    const queryBuilder = this.reviewRepository.createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('review.product', 'product');

    // Applica filtri
    this.applyFilters(queryBuilder, filterDto);

    // Solo recensioni approvate per default (a meno che non sia specificato diversamente)
    if (filterDto.isApproved === undefined) {
      queryBuilder.andWhere('review.isApproved = :isApproved', { isApproved: true });
    }

    // Applicazione ordinamento
    this.applySorting(queryBuilder, filterDto.sortBy || 'newest');

    // Paginazione
    const page = Math.max(1, Math.floor((filterDto.offset || 0) / (filterDto.limit || 20)) + 1);
    const limit = filterDto.limit || 20;
    const offset = filterDto.offset || 0;

    queryBuilder.skip(offset).take(limit);

    const [reviews, total] = await queryBuilder.getManyAndCount();

    // Converti in DTO
    const reviewDtos = reviews.map(review =>
      plainToClass(ReviewResponseDto, review, {
        excludeExtraneousValues: true,
      })
    );

    // Calcola statistiche se filtrato per prodotto
    let averageRating: number | undefined;
    let ratingDistribution: { [key: number]: number } | undefined;

    if (filterDto.productId) {
      const stats = await this.getProductRatingStats(filterDto.productId);
      averageRating = stats.averageRating;
      ratingDistribution = stats.ratingDistribution;
    }

    return {
      reviews: reviewDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
      averageRating,
      ratingDistribution,
    };
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: ['user', 'product', 'order'],
    });

    if (!review) {
      throw new NotFoundException('Recensione non trovata');
    }

    return review;
  }

  async findOneDetailed(id: string): Promise<ReviewResponseDto> {
    const review = await this.findOne(id);
    return plainToClass(ReviewResponseDto, review, {
      excludeExtraneousValues: true,
    });
  }

  async findByUser(userId: string, includeUnapproved: boolean = false): Promise<ReviewResponseDto[]> {
    const queryBuilder = this.reviewRepository.createQueryBuilder('review')
      .leftJoinAndSelect('review.product', 'product')
      .where('review.userId = :userId', { userId });

    if (!includeUnapproved) {
      queryBuilder.andWhere('review.isApproved = :isApproved', { isApproved: true });
    }

    const reviews = await queryBuilder
      .orderBy('review.createdAt', 'DESC')
      .getMany();

    return reviews.map(review =>
      plainToClass(ReviewResponseDto, review, {
        excludeExtraneousValues: true,
      })
    );
  }

  async findByProduct(productId: string, filterDto: Partial<ReviewFilterDto> = {}): Promise<ReviewListResponseDto> {
    return this.findAll({
      ...filterDto,
      productId,
      isApproved: filterDto.isApproved !== undefined ? filterDto.isApproved : true,
    });
  }

  // ===========================
  // UPDATE & DELETE OPERATIONS
  // ===========================

  async update(id: string, userId: string, updateReviewDto: UpdateReviewDto): Promise<ReviewResponseDto> {
    const review = await this.reviewRepository.findOne({
      where: { id, userId },
    });

    if (!review) {
      throw new NotFoundException('Recensione non trovata o non autorizzato');
    }

    const oldRating = review.rating;
    Object.assign(review, updateReviewDto);

    // Reset approval se contenuto significativo è cambiato
    if (updateReviewDto.comment || updateReviewDto.rating) {
      review.isApproved = true; // Mantieni approvato per acquisti verificati
    }

    const updatedReview = await this.reviewRepository.save(review);

    // Se il rating è cambiato, aggiorna statistiche prodotto
    if (updateReviewDto.rating && updateReviewDto.rating !== oldRating) {
      await this.updateProductRatingStats(review.productId);
    }

    this.logger.log(`📝 Recensione aggiornata: ${id} da user ${userId}`);
    return this.findOneDetailed(updatedReview.id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id, userId },
    });

    if (!review) {
      throw new NotFoundException('Recensione non trovata o non autorizzato');
    }

    const productId = review.productId;
    await this.reviewRepository.remove(review);

    // Aggiorna statistiche prodotto
    await this.updateProductRatingStats(productId);

    this.logger.log(`🗑️ Recensione eliminata: ${id} da user ${userId}`);
  }

  // ===========================
  // ADMIN OPERATIONS
  // ===========================

  async addStoreResponse(id: string, storeResponseDto: StoreResponseDto): Promise<ReviewResponseDto> {
    const review = await this.findOne(id);

    review.storeResponse = storeResponseDto.storeResponse;
    review.storeResponseDate = new Date();

    const updatedReview = await this.reviewRepository.save(review);
    this.logger.log(`💬 Risposta negozio aggiunta alla recensione: ${id}`);

    return this.findOneDetailed(updatedReview.id);
  }

  async toggleFeatured(id: string): Promise<ReviewResponseDto> {
    const review = await this.findOne(id);
    review.isFeatured = !review.isFeatured;

    const updatedReview = await this.reviewRepository.save(review);
    this.logger.log(`⭐ Recensione ${review.isFeatured ? 'evidenziata' : 'rimossa da evidenze'}: ${id}`);

    return this.findOneDetailed(updatedReview.id);
  }

  async toggleApproval(id: string): Promise<ReviewResponseDto> {
    const review = await this.findOne(id);
    review.isApproved = !review.isApproved;

    const updatedReview = await this.reviewRepository.save(review);

    // Aggiorna statistiche prodotto
    await this.updateProductRatingStats(review.productId);

    this.logger.log(`✅ Recensione ${review.isApproved ? 'approvata' : 'disapprovata'}: ${id}`);
    return this.findOneDetailed(updatedReview.id);
  }

  async bulkAction(bulkActionDto: BulkReviewActionDto, adminUserId: string): Promise<{
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const results = { successful: 0, failed: 0, errors: [] as string[] };

    for (const reviewId of bulkActionDto.reviewIds) {
      try {
        const review = await this.reviewRepository.findOne({ where: { id: reviewId } });
        if (!review) {
          results.failed++;
          results.errors.push(`Recensione ${reviewId} non trovata`);
          continue;
        }

        switch (bulkActionDto.action) {
          case 'approve':
            review.isApproved = true;
            break;
          case 'disapprove':
            review.isApproved = false;
            break;
          case 'feature':
            review.isFeatured = true;
            break;
          case 'unfeature':
            review.isFeatured = false;
            break;
          case 'delete':
            await this.reviewRepository.remove(review);
            await this.updateProductRatingStats(review.productId);
            results.successful++;
            continue;
        }

        await this.reviewRepository.save(review);
        if (bulkActionDto.action === 'approve' || bulkActionDto.action === 'disapprove') {
          await this.updateProductRatingStats(review.productId);
        }

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Recensione ${reviewId}: ${error.message}`);
      }
    }

    this.logger.log(`📋 Bulk action ${bulkActionDto.action}: ${results.successful} successi, ${results.failed} fallimenti`);
    return results;
  }

  // ===========================
  // VOTING SYSTEM
  // ===========================

  async voteHelpful(id: string, userId: string, isHelpful: boolean): Promise<ReviewResponseDto> {
    const review = await this.findOne(id);

    // Verifica che l'utente non stia votando la propria recensione
    if (review.userId === userId) {
      throw new BadRequestException('Non puoi votare la tua recensione');
    }

    // TODO: In produzione implementare tabella separata per tracking voti per utente
    // Per ora implementazione semplificata
    if (isHelpful) {
      review.helpfulVotes += 1;
    }
    review.totalVotes += 1;

    const updatedReview = await this.reviewRepository.save(review);
    this.logger.log(`👍 Voto aggiunto alla recensione: ${id} da user ${userId}`);

    return this.findOneDetailed(updatedReview.id);
  }

  // ===========================
  // STATISTICS & ANALYTICS
  // ===========================

  async getProductRatingStats(productId: string): Promise<ProductRatingStatsDto> {
    const reviews = await this.reviewRepository.find({
      where: { productId, isApproved: true },
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      ratingDistribution[Math.floor(review.rating)] += 1;
    });

    const positiveReviews = reviews.filter(r => r.rating >= 4).length;
    const positivePercentage = totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0;

    const reviewsWithImages = reviews.filter(r => r.images && r.images.length > 0).length;
    const verifiedPurchases = reviews.filter(r => r.isVerifiedPurchase).length;

    // Recensioni dell'ultimo mese
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const recentReviews = reviews.filter(r => r.createdAt >= oneMonthAgo).length;

    return {
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
      ratingDistribution,
      positivePercentage,
      reviewsWithImages,
      verifiedPurchases,
      recentReviews,
    };
  }

  async getReviewStats(): Promise<ReviewStatsResponseDto> {
    const [
      totalReviews,
      approvedReviews,
      featuredReviews,
      verifiedPurchases,
    ] = await Promise.all([
      this.reviewRepository.count(),
      this.reviewRepository.count({ where: { isApproved: true } }),
      this.reviewRepository.count({ where: { isFeatured: true } }),
      this.reviewRepository.count({ where: { isVerifiedPurchase: true } }),
    ]);

    const reviewsWithImages = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.images IS NOT NULL')
      .andWhere('review.images != :emptyArray', { emptyArray: '[]' })
      .getCount();

    const reviewsWithStoreResponse = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.storeResponse IS NOT NULL')
      .getCount();

    const pendingReviews = totalReviews - approvedReviews;

    // Media rating generale
    const allReviews = await this.reviewRepository.find({
      where: { isApproved: true },
      select: ['rating']
    });
    const averageRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;

    // Recensioni del mese corrente
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const reviewsThisMonth = await this.reviewRepository.count({
      where: {
        createdAt: MoreThanOrEqual(startOfMonth)
      }
    });

    // Top prodotti per rating
    const topRatedProducts = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.id as productId',
        'product.name as productName',
        'product.averageRating as averageRating',
        'product.reviewCount as totalReviews'
      ])
      .where('product.reviewCount >= :minReviews', { minReviews: 5 })
      .orderBy('product.averageRating', 'DESC')
      .limit(10)
      .getRawMany();

    // Recensioni recenti
    const recentReviewsData = await this.reviewRepository.find({
      relations: ['user', 'product'],
      order: { createdAt: 'DESC' },
      take: 10
    });

    const recentReviews = recentReviewsData.map(review =>
      plainToClass(ReviewResponseDto, review, {
        excludeExtraneousValues: true,
      })
    );

    // TODO: Implementare trend rating per mese
    const ratingTrends = []; // Placeholder

    return {
      totalReviews,
      approvedReviews,
      pendingReviews,
      featuredReviews,
      verifiedPurchases,
      averageRating: Math.round(averageRating * 10) / 10,
      reviewsThisMonth,
      reviewsWithImages,
      reviewsWithStoreResponse,
      topRatedProducts,
      recentReviews,
      ratingTrends,
    };
  }

  // ===========================
  // USER ELIGIBILITY
  // ===========================

  async getUserEligibleProducts(userId: string): Promise<Array<{
    productId: string;
    productName: string;
    productImage?: string;
    orderId: string;
    orderDate: Date;
    canReview: boolean;
    reason?: string;
  }>> {
    // FIX #10: Solo ordini 'delivered' sono eleggibili per recensioni
    // 'confirmed' significa solo pagamento confermato, non prodotto ricevuto
    const deliveredOrders = await this.orderRepository.find({
      where: {
        userId,
        status: OrderStatus.DELIVERED
      },
      relations: ['items', 'items.variant', 'items.variant.product'],
      order: { deliveredAt: 'DESC' }
    });

    // Pre-fetch recensioni esistenti per lookup O(1)
    const existingReviews = await this.reviewRepository.find({
      where: { userId },
      select: ['productId']
    });
    const reviewedProductIds = new Set(existingReviews.map(r => r.productId));

    const eligibleProducts: Array<{
      productId: string;
      productName: string;
      productImage?: string;
      orderId: string;
      orderDate: Date;
      canReview: boolean;
      reason?: string;
    }> = [];

    const seenProducts = new Set<string>();

    for (const order of deliveredOrders) {
      for (const item of order.items) {
        const productId = item.variant?.productId;
        if (!productId) continue;

        // Skip duplicati (mantiene ordine più recente grazie all'ordinamento DESC)
        if (seenProducts.has(productId)) continue;

        // Skip prodotti non attivi o eliminati
        const product = item.variant?.product;
        if (!product || !product.isActive) continue;

        seenProducts.add(productId);

        const canReview = !reviewedProductIds.has(productId);

        eligibleProducts.push({
          productId,
          productName: item.productName || product?.name || 'Prodotto sconosciuto',
          productImage: (product as any)?.images?.[0],
          orderId: order.id,
          orderDate: order.deliveredAt || order.createdAt,
          canReview,
          reason: canReview ? undefined : 'Già recensito',
        });
      }
    }

    return eligibleProducts;
  }

  // ===========================
  // HELPER METHODS
  // ===========================

  private async checkUserPurchase(userId: string, productId: string): Promise<{
    hasPurchased: boolean;
    orderIds: string[];
  }> {
    // FIX #10: Solo ordini 'delivered' sono validi per verificare l'acquisto
    const orderItems = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.variant', 'variant')
      .innerJoin('orderItem.order', 'order')
      .where('order.userId = :userId', { userId })
      .andWhere('variant.productId = :productId', { productId })
      .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
      .select(['orderItem.orderId', 'order.deliveredAt'])
      .orderBy('order.deliveredAt', 'DESC')
      .getRawMany();

    return {
      hasPurchased: orderItems.length > 0,
      orderIds: orderItems.map(item => item.orderItem_orderId),
    };
  }

  private async updateProductRatingStats(productId: string): Promise<void> {
    const stats = await this.getProductRatingStats(productId);

    await this.productRepository.update(productId, {
      averageRating: stats.averageRating,
      reviewCount: stats.totalReviews,
    });
  }

  private applyFilters(queryBuilder: any, filterDto: ReviewFilterDto): void {
    if (filterDto.productId) {
      queryBuilder.andWhere('review.productId = :productId', { productId: filterDto.productId });
    }

    if (filterDto.userId) {
      queryBuilder.andWhere('review.userId = :userId', { userId: filterDto.userId });
    }

    if (filterDto.minRating !== undefined) {
      queryBuilder.andWhere('review.rating >= :minRating', { minRating: filterDto.minRating });
    }

    if (filterDto.maxRating !== undefined) {
      queryBuilder.andWhere('review.rating <= :maxRating', { maxRating: filterDto.maxRating });
    }

    if (filterDto.isVerifiedPurchase !== undefined) {
      queryBuilder.andWhere('review.isVerifiedPurchase = :isVerifiedPurchase', {
        isVerifiedPurchase: filterDto.isVerifiedPurchase
      });
    }

    if (filterDto.isApproved !== undefined) {
      queryBuilder.andWhere('review.isApproved = :isApproved', {
        isApproved: filterDto.isApproved
      });
    }

    if (filterDto.isFeatured !== undefined) {
      queryBuilder.andWhere('review.isFeatured = :isFeatured', {
        isFeatured: filterDto.isFeatured
      });
    }

    if (filterDto.hasImages !== undefined) {
      if (filterDto.hasImages) {
        queryBuilder.andWhere('review.images IS NOT NULL AND review.images != \'[]\'');
      } else {
        queryBuilder.andWhere('(review.images IS NULL OR review.images = \'[]\')');
      }
    }

    if (filterDto.hasStoreResponse !== undefined) {
      if (filterDto.hasStoreResponse) {
        queryBuilder.andWhere('review.storeResponse IS NOT NULL');
      } else {
        queryBuilder.andWhere('review.storeResponse IS NULL');
      }
    }

    if (filterDto.dateFrom) {
      queryBuilder.andWhere('review.createdAt >= :dateFrom', {
        dateFrom: new Date(filterDto.dateFrom)
      });
    }

    if (filterDto.dateTo) {
      queryBuilder.andWhere('review.createdAt <= :dateTo', {
        dateTo: new Date(filterDto.dateTo)
      });
    }
  }

  private applySorting(queryBuilder: any, sortBy: string): void {
    switch (sortBy) {
      case 'oldest':
        queryBuilder.orderBy('review.createdAt', 'ASC');
        break;
      case 'highest_rating':
        queryBuilder.orderBy('review.rating', 'DESC');
        break;
      case 'lowest_rating':
        queryBuilder.orderBy('review.rating', 'ASC');
        break;
      case 'most_helpful':
        queryBuilder.orderBy('review.helpfulVotes', 'DESC');
        break;
      case 'newest':
      default:
        queryBuilder.orderBy('review.isFeatured', 'DESC')
          .addOrderBy('review.createdAt', 'DESC');
        break;
    }
  }
}