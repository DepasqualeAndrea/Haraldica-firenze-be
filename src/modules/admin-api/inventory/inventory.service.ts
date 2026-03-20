import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { plainToClass } from "class-transformer";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DataSource, EntityManager, Repository } from "typeorm";

// Entities
import { InventoryMovement, InventoryMovementType } from "src/database/entities/inventory-movement.entity";
import { ProductVariant } from "src/database/entities/product-variant.entity";
import { User } from "src/database/entities/user.entity";
import { StockReservation, ReservationStatus } from "src/database/entities/stock-reservation.entity";

// DTOs
import { InventoryMovementResponseDto, InventoryStatsResponseDto } from "./dto/response.dto";
import { UpdateStockInventroryDto } from "./dto/update-stock.dto";
import { StockMovementFilterDto } from "./dto/stock-movement.dto";
import { EmailService } from "src/modules/public-api/notifications/email.service";



@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryMovement)
    private inventoryRepository: Repository<InventoryMovement>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(StockReservation)
    private reservationRepository: Repository<StockReservation>,
    private dataSource: DataSource,
    private emailService: EmailService,
  ) { }

  // ===========================
  // 📦 CORE STOCK MANAGEMENT
  // ===========================

  /**
   * Aggiorna stock variante con movimento registrato
   * Gestisce IN, OUT, SALE, RETURN, ADJUSTMENT, DAMAGE
   */
  async updateStock(
    variantId: string,
    updateStockDto: UpdateStockInventroryDto,
    userId?: string
  ): Promise<InventoryMovementResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Trova variante e stock corrente
      const { variant, quantityBefore } = await this._findVariantAndStock(variantId, manager);

      // 2. Calcola movimento effettivo
      const actualMovement = this._determineActualMovement(
        updateStockDto.movementType,
        updateStockDto.quantity
      );

      // 3. Calcola nuovo stock
      const quantityAfter = this._calculateNewStock(
        quantityBefore,
        actualMovement,
        updateStockDto.movementType
      );

      // 4. Validazione
      if (quantityAfter < 0) {
        const displayName = variant.product?.name ?? variant.sku;
        throw new BadRequestException(
          `Stock insufficiente per ${displayName}. ` +
          `Stock attuale: ${quantityBefore}, Richiesto: ${Math.abs(actualMovement)}`
        );
      }

      // 5. Registra movimento e aggiorna stock
      const savedMovement = await this._recordMovementAndUpdateStock({
        manager,
        variant,
        quantityBefore,
        quantityAfter,
        actualMovement,
        updateStockDto,
        userId
      });

      const displayName = variant.product?.name ?? variant.sku;
      this.logger.log(
        `📦 Stock aggiornato: ${displayName} (${variant.sku}) - ${quantityBefore} → ${quantityAfter}`
      );

      return plainToClass(InventoryMovementResponseDto, savedMovement, {
        excludeExtraneousValues: true,
      });
    });
  }

  /**
   * Riduce stock direttamente (per ordini legacy)
   * @deprecated Usa softReserveStock + confirmReservation invece
   */
  async reduceStock(
    variantId: string,
    quantityToSubtract: number,
    manager: EntityManager
  ): Promise<void> {
    const variant = await manager.findOne(ProductVariant, { where: { id: variantId } });

    if (!variant) {
      throw new NotFoundException(
        `Impossibile ridurre stock: variante ${variantId} non trovata`
      );
    }

    if (variant.stock < quantityToSubtract) {
      const displayName = variant.product?.name ?? variant.sku;
      throw new BadRequestException(
        `Stock insufficiente per ${displayName}. ` +
        `Disponibili: ${variant.stock}, Richiesti: ${quantityToSubtract}`
      );
    }

    variant.stock -= quantityToSubtract;
    await manager.save(ProductVariant, variant);
  }

  // ===========================
  // 🔒 SOFT RESERVE SYSTEM (Stock Reservations)
  // ===========================

  /**
   * Riserva stock per un ordine PENDING
   * - Non scala lo stock fisico
   * - Incrementa variant.reservedStock
   * - Crea record StockReservation con scadenza (default 2h)
   * - Usato durante checkout prima del pagamento
   */
  async softReserveStock(
    variantId: string,
    quantity: number,
    orderId: string,
    expiryHours: number = 2,
    manager?: EntityManager
  ): Promise<StockReservation> {
    const execute = async (mgr: EntityManager) => {
      // 1. Lock variante per evitare race conditions
      const lockedVariant = await mgr
        .createQueryBuilder(ProductVariant, 'variant')
        .setLock('pessimistic_write')
        .where('variant.id = :variantId', { variantId })
        .getOne();

      if (!lockedVariant) {
        throw new NotFoundException(`Variante ${variantId} non trovata`);
      }

      // Poi carica la variante completa (senza lock, già protetta)
      const variant = await mgr.findOne(ProductVariant, {
        where: { id: variantId }
      });

      if (!variant) {
        throw new NotFoundException(`Variante ${variantId} non trovata`);
      }

      // 2. Verifica stock disponibile (stock - reservedStock)
      const availableStock = variant.stock - (variant.reservedStock || 0);

      if (availableStock < quantity) {
        const displayName = variant.product?.name ?? variant.sku;
        throw new BadRequestException(
          `Stock insufficiente per ${displayName}. ` +
          `Disponibile: ${availableStock}, Richiesto: ${quantity} ` +
          `(Stock totale: ${variant.stock}, Riservato: ${variant.reservedStock || 0})`
        );
      }

      // 3. Verifica se esiste già una reservation per questo ordine+variante
      let reservation = await mgr.findOne(StockReservation, {
        where: { orderId, variantId }
      });

      if (reservation) {
        // Reservation esistente - aggiorna
        if (reservation.status !== ReservationStatus.RESERVED) {
          throw new BadRequestException(
            `Reservation già ${reservation.status} per ordine ${orderId}`
          );
        }

        const oldQuantity = reservation.quantity;
        reservation.quantity = quantity;
        reservation.setExpiry(expiryHours);
        reservation.updatedAt = new Date();

        // Aggiorna reserved stock
        const quantityDiff = quantity - oldQuantity;
        variant.reservedStock = (variant.reservedStock || 0) + quantityDiff;

        await mgr.save(ProductVariant, variant);
        reservation = await mgr.save(StockReservation, reservation);

        const displayName = variant.product?.name ?? variant.sku;
        this.logger.log(
          `🔄 Reservation aggiornata: Ordine ${orderId}, ` +
          `Variante ${displayName} (${variant.sku}), Qty: ${oldQuantity} → ${quantity}`
        );
      } else {
        // 4. Crea nuova reservation
        reservation = mgr.create(StockReservation, {
          variantId,
          orderId,
          quantity,
          status: ReservationStatus.RESERVED,
          reservedAt: new Date(),
          reason: 'checkout_initiated',
        });

        reservation.setExpiry(expiryHours);

        // 5. Incrementa reserved stock
        variant.reservedStock = (variant.reservedStock || 0) + quantity;

        await mgr.save(ProductVariant, variant);
        reservation = await mgr.save(StockReservation, reservation);

        const displayName = variant.product?.name ?? variant.sku;
        this.logger.log(
          `✅ Stock riservato: Ordine ${orderId}, ` +
          `Variante ${displayName} (${variant.sku}), Qty: ${quantity}, ` +
          `Scadenza: ${reservation.expiresAt?.toLocaleString('it-IT')}`
        );
      }

      return reservation;
    };

    return manager ? execute(manager) : this.dataSource.transaction(execute);
  }

  /**
   * Conferma reservation → scala stock definitivo
   * - Trova tutte le reservations per l'ordine
   * - Scala variant.stock
   * - Decrementa variant.reservedStock
   * - Marca reservation come CONFIRMED
   * - Crea InventoryMovement di tipo SALE
   * - Usato dal webhook dopo pagamento confermato
   */
  async confirmReservation(
    orderId: string,
    manager?: EntityManager
  ): Promise<void> {
    const execute = async (mgr: EntityManager) => {
      // 1. Trova tutte le reservations per questo ordine
      const reservations = await mgr.find(StockReservation, {
        where: { orderId, status: ReservationStatus.RESERVED },
        relations: ['variant', 'variant.product']
      });

      if (reservations.length === 0) {
        this.logger.warn(
          `⚠️ Nessuna reservation RESERVED trovata per ordine ${orderId}`
        );
        return;
      }

      this.logger.log(
        `🔄 Confermo ${reservations.length} reservations per ordine ${orderId}`
      );

      for (const reservation of reservations) {
        const variant = reservation.variant;

        if (!variant) {
          this.logger.error(
            `❌ Variante ${reservation.variantId} non trovata per reservation ${reservation.id}`
          );
          continue;
        }

        // 2. Lock variante (query semplice senza JOIN)
        await mgr
          .createQueryBuilder(ProductVariant, 'variant')
          .setLock('pessimistic_write')
          .where('variant.id = :id', { id: variant.id })
          .getOne();

        // 3. Verifica stock sufficiente
        if (variant.stock < reservation.quantity) {
          const displayName = variant.product?.name ?? variant.sku;
          throw new BadRequestException(
            `Stock insufficiente per confermare ordine ${orderId}. ` +
            `Variante: ${displayName} (${variant.sku}), ` +
            `Stock: ${variant.stock}, Richiesto: ${reservation.quantity}`
          );
        }

        const quantityBefore = variant.stock;
        const reservedBefore = variant.reservedStock || 0;

        // 4. Scala stock fisico
        variant.stock -= reservation.quantity;

        // 5. Decrementa reserved stock
        variant.reservedStock = Math.max(
          0,
          reservedBefore - reservation.quantity
        );

        await mgr.save(ProductVariant, variant);

        // 6. Marca reservation come CONFIRMED con confirmedAt
        reservation.status = ReservationStatus.CONFIRMED;
        reservation.confirmedAt = new Date();
        await mgr.save(StockReservation, reservation);

        // 7. Crea movimento inventario SALE
        const movement = mgr.create(InventoryMovement, {
          variantId: variant.id,
          movementType: InventoryMovementType.SALE,
          quantity: -reservation.quantity,
          quantityBefore,
          quantityAfter: variant.stock,
          orderId,
          reason: `Vendita ordine ${orderId}`,
          notes: `Stock reservation confermata: ${reservation.id}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await mgr.save(InventoryMovement, movement);

        const displayName = variant.product?.name ?? variant.sku;
        this.logger.log(
          `✅ Stock confermato: Variante ${displayName} (${variant.sku}), ` +
          `Qty: ${reservation.quantity}, ` +
          `Stock: ${quantityBefore} → ${variant.stock}, ` +
          `Reserved: ${reservedBefore} → ${variant.reservedStock}`
        );
      }

      this.logger.log(`🎉 Tutte le reservations confermate per ordine ${orderId}`);
    };

    return manager ? execute(manager) : this.dataSource.transaction(execute);
  }

  /**
   * Rilascia reservation → ripristina availableStock
   * - Decrementa variant.reservedStock
   * - Marca reservation come RELEASED
   * - NON tocca variant.stock (non era stato scalato)
   * - Usato quando ordine viene cancellato o scade
   */
  async releaseReservation(
    orderId: string,
    reason: string,
    manager?: EntityManager
  ): Promise<void> {
    const execute = async (mgr: EntityManager) => {
      // 1. Trova tutte le reservations attive per questo ordine
      const reservations = await mgr.find(StockReservation, {
        where: { orderId },
        relations: ['variant']
      });

      if (reservations.length === 0) {
        this.logger.warn(`⚠️ Nessuna reservation trovata per ordine ${orderId}`);
        return;
      }

      // Filtra solo quelle rilasciabili
      const releasableReservations = reservations.filter(r => r.canBeReleased());

      if (releasableReservations.length === 0) {
        this.logger.warn(
          `⚠️ Nessuna reservation rilasciabile per ordine ${orderId}. ` +
          `Stati: ${reservations.map(r => r.status).join(', ')}`
        );
        return;
      }

      this.logger.log(
        `🔄 Rilascio ${releasableReservations.length} reservations per ordine ${orderId}. ` +
        `Motivo: ${reason}`
      );

      for (const reservation of releasableReservations) {
        const variant = reservation.variant;

        if (!variant) {
          this.logger.error(
            `❌ Variante ${reservation.variantId} non trovata per reservation ${reservation.id}`
          );
          continue;
        }

        // 2. Decrementa reserved stock
        const oldReserved = variant.reservedStock || 0;
        variant.reservedStock = Math.max(0, oldReserved - reservation.quantity);

        await mgr.save(ProductVariant, variant);

        // 3. Marca reservation come RELEASED
        reservation.status = ReservationStatus.RELEASED;
        reservation.releasedAt = new Date();
        reservation.metadata = {
          ...reservation.metadata,
          releaseReason: reason,
        };

        await mgr.save(StockReservation, reservation);

        const displayName = variant.product?.name ?? variant.sku;
        this.logger.log(
          `✅ Stock rilasciato: Variante ${displayName} (${variant.sku}), ` +
          `Qty: ${reservation.quantity}, ` +
          `Reserved: ${oldReserved} → ${variant.reservedStock}`
        );
      }

      this.logger.log(`🎉 Tutte le reservations rilasciate per ordine ${orderId}`);
    };

    return manager ? execute(manager) : this.dataSource.transaction(execute);
  }

  /**
   * Cleanup automatico reservations scadute
   * - Trova reservations RESERVED con expiresAt < NOW
   * - Rilascia automaticamente
   * - Eseguito da CRON ogni 10 minuti
   * - Ritorna statistiche cleanup
   */
  async cleanupExpiredReservations(): Promise<{
    cleaned: number;
    releasedReservations: Array<{
      id: string;
      orderId: string;
      productName: string;
      quantity: number;
      expiredAt: Date;
    }>;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();

      // 1. Trova reservations scadute
      const expiredReservations = await manager.find(StockReservation, {
        where: {
          status: ReservationStatus.RESERVED,
        },
        relations: ['variant', 'variant.product']
      });

      // Filtra solo quelle effettivamente scadute
      const reallyExpired = expiredReservations.filter(r =>
        r.expiresAt && r.expiresAt < now
      );

      if (reallyExpired.length === 0) {
        this.logger.debug('✅ Nessuna reservation scaduta da pulire');
        return { cleaned: 0, releasedReservations: [] };
      }

      this.logger.log(`🧹 Pulizia ${reallyExpired.length} reservations scadute`);

      const releasedReservations: Array<{
        id: string;
        orderId: string;
        productName: string;
        quantity: number;
        expiredAt: Date;
      }> = [];

      for (const reservation of reallyExpired) {
        try {
          const variant = reservation.variant;

          if (!variant) {
            this.logger.error(`❌ Variante ${reservation.variantId} non trovata`);
            continue;
          }

          // Decrementa reserved stock
          const oldReserved = variant.reservedStock || 0;
          variant.reservedStock = Math.max(0, oldReserved - reservation.quantity);
          await manager.save(ProductVariant, variant);

          // Marca come EXPIRED
          reservation.status = ReservationStatus.EXPIRED;
          reservation.releasedAt = new Date();
          reservation.metadata = {
            ...reservation.metadata,
            autoReleased: true,
            releaseReason: 'automatic_cleanup_expired',
          };
          await manager.save(StockReservation, reservation);

          const productName = variant.product?.name ?? variant.sku;

          releasedReservations.push({
            id: reservation.id,
            orderId: reservation.orderId,
            productName,
            quantity: reservation.quantity,
            expiredAt: reservation.expiresAt!,
          });

          this.logger.log(
            `✅ Reservation scaduta rilasciata: ` +
            `Ordine ${reservation.orderId}, ` +
            `Variante ${productName} (${variant.sku}), ` +
            `Qty: ${reservation.quantity}, ` +
            `Scaduta: ${reservation.expiresAt?.toLocaleString('it-IT')}`
          );
        } catch (error) {
          this.logger.error(
            `❌ Errore cleanup reservation ${reservation.id}: ${error.message}`
          );
        }
      }

      this.logger.log(
        `🎉 Cleanup completato: ${releasedReservations.length}/${reallyExpired.length} reservations pulite`
      );

      return {
        cleaned: releasedReservations.length,
        releasedReservations,
      };
    });
  }

  // ===========================
  // 📊 QUERY METHODS
  // ===========================

  /**
   * Ottieni movimenti per variante specifica
   */
  async getVariantMovements(
    variantId: string,
    filterDto: StockMovementFilterDto = {}
  ): Promise<InventoryMovementResponseDto[]> {
    const queryBuilder = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('inventory.user', 'user')
      .where('inventory.variantId = :variantId', { variantId });

    this.applyMovementFilters(queryBuilder, filterDto);

    const movements = await queryBuilder
      .orderBy('inventory.createdAt', 'DESC')
      .limit(filterDto.limit || 100)
      .offset(filterDto.offset || 0)
      .getMany();

    return movements.map(movement =>
      plainToClass(InventoryMovementResponseDto, movement, {
        excludeExtraneousValues: true,
      })
    );
  }

  /**
   * Ottieni tutti i movimenti con filtri
   */
  async getAllMovements(
    filterDto: StockMovementFilterDto = {}
  ): Promise<InventoryMovementResponseDto[]> {
    const queryBuilder = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('inventory.user', 'user');

    this.applyMovementFilters(queryBuilder, filterDto);

    if (filterDto.variantId) {
      queryBuilder.andWhere('inventory.variantId = :variantId', {
        variantId: filterDto.variantId
      });
    }

    const movements = await queryBuilder
      .orderBy('inventory.createdAt', 'DESC')
      .limit(filterDto.limit || 100)
      .offset(filterDto.offset || 0)
      .getMany();

    return movements.map(movement =>
      plainToClass(InventoryMovementResponseDto, movement, {
        excludeExtraneousValues: true,
      })
    );
  }

  // ===========================
  // 💰 INVENTORY VALUE & ANALYTICS
  // ===========================

  /**
   * Calcola valore totale inventario
   */
  async getInventoryValue(): Promise<{
    totalValue: number;
    averageValue: number;
    topValueProducts: Array<{
      productId: string;
      productName: string;
      value: number;
      stock: number;
      unitCost?: number;
    }>;
  }> {
    // Ultimi costi per variante
    const latestCosts = await this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('inventory.unitCost IS NOT NULL')
      .distinctOn(['inventory.variantId'])
      .orderBy('inventory.variantId')
      .addOrderBy('inventory.createdAt', 'DESC')
      .getMany();

    const variantValues = new Map<string, {
      cost: number;
      stock: number;
      productName: string;
    }>();

    for (const mv of latestCosts) {
      const v = mv.variant;
      if (!v) continue;

      const cost = Number(mv.unitCost) || 0;
      variantValues.set(mv.variantId!, {
        cost,
        stock: v.stock ?? 0,
        productName: v.product?.name ?? v.sku,
      });
    }

    let totalValue = 0;
    const topValueProducts: Array<{
      productId: string;
      productName: string;
      value: number;
      stock: number;
      unitCost?: number;
    }> = [];

    variantValues.forEach((data, variantId) => {
      const value = data.cost * data.stock;
      totalValue += value;

      topValueProducts.push({
        productId: variantId,
        productName: data.productName,
        value,
        stock: data.stock,
        unitCost: data.cost,
      });
    });

    topValueProducts.sort((a, b) => b.value - a.value);

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      averageValue: variantValues.size > 0
        ? Math.round((totalValue / variantValues.size) * 100) / 100
        : 0,
      topValueProducts: topValueProducts.slice(0, 10),
    };
  }

  /**
   * Statistiche complete inventario
   */
  async getInventoryStats(): Promise<InventoryStatsResponseDto> {
    const [
      totalMovements,
      inMovements,
      outMovements,
      adjustments,
      inventoryValue,
      recentMovements,
      lowStockProducts
    ] = await Promise.all([
      this.inventoryRepository.count(),
      this.inventoryRepository.count({
        where: { movementType: InventoryMovementType.IN }
      }),
      this.inventoryRepository.count({
        where: { movementType: InventoryMovementType.OUT }
      }),
      this.inventoryRepository.count({
        where: { movementType: InventoryMovementType.ADJUSTMENT }
      }),
      this.getInventoryValue(),
      this.getAllMovements({ limit: 10, offset: 0 }),
      this.getLowStockProducts(),
    ]);

    // Conta movimenti per tipo
    const movementsByType: { [key: string]: number } = {};
    for (const type of Object.values(InventoryMovementType)) {
      movementsByType[type] = await this.inventoryRepository.count({
        where: { movementType: type }
      });
    }

    return {
      totalMovements,
      inMovements,
      outMovements,
      adjustments,
      totalInventoryValue: inventoryValue.totalValue,
      movementsByType,
      recentMovements,
      topValueProducts: inventoryValue.topValueProducts,
      lowStockProducts,
    } as any;
  }

  // ===========================
  // 🔗 ORDER INTEGRATION METHODS
  // ===========================

  /**
   * Registra movimento vendita
   */
  async recordSaleMovement(
    variantId: string,
    quantity: number,
    orderId?: string,
    userId?: string
  ): Promise<void> {
    await this.updateStock(variantId, {
      quantity,
      movementType: InventoryMovementType.SALE,
      reason: 'Vendita variante',
      notes: orderId ? `Ordine: ${orderId}` : undefined,
    }, userId);
  }

  /**
   * Registra movimento reso
   */
  async recordReturnMovement(
    variantId: string,
    quantity: number,
    orderId?: string,
    userId?: string
  ): Promise<void> {
    await this.updateStock(variantId, {
      quantity,
      movementType: InventoryMovementType.RETURN,
      reason: 'Reso variante',
      notes: orderId ? `Reso ordine: ${orderId}` : undefined,
    }, userId);
  }

  /**
   * Registra movimento merce danneggiata
   */
  async recordDamageMovement(
    variantId: string,
    quantity: number,
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.updateStock(variantId, {
      quantity,
      movementType: InventoryMovementType.DAMAGE,
      reason: reason || 'Merce danneggiata',
    }, userId);
  }

  // ===========================
  // ✅ STOCK VALIDATION
  // ===========================

  /**
   * Valida disponibilità stock per una variante
   */
  async validateStockAvailability(
    variantId: string,
    requestedQuantity: number
  ): Promise<{
    available: boolean;
    currentStock: number;
    reservedStock: number;
    availableStock: number;
    shortage: number;
    itemInfo: {
      id: string;
      name: string;
      sku: string | null;
      productName: string;
    };
  }> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['product']
    });

    if (!variant) {
      throw new NotFoundException(`Variante ${variantId} non trovata`);
    }

    const availableStock = variant.availableStock; // usa getter
    const shortage = Math.max(0, requestedQuantity - availableStock);

    return {
      available: availableStock >= requestedQuantity,
      currentStock: variant.stock,
      reservedStock: variant.reservedStock || 0,
      availableStock,
      shortage,
      itemInfo: {
        id: variant.id,
        name: variant.product?.name ?? variant.sku,
        sku: variant.sku,
        productName: variant.product?.name ?? '',
      },
    };
  }

  // ===========================
  // ⚠️ LOW STOCK ALERTS
  // ===========================

  /**
   * CRON: Controlla varianti sotto soglia ogni giorno alle 9:00
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkLowStockAndAlert(): Promise<void> {
    this.logger.log('🔍 Controllo varianti sotto soglia...');

    try {
      const lowStockProducts = await this.getLowStockProducts();

      if (lowStockProducts.length === 0) {
        this.logger.log('✅ Tutte le varianti hanno stock sufficiente');
        return;
      }

      this.logger.warn(
        `⚠️ Trovate ${lowStockProducts.length} varianti sotto soglia`
      );

      // Invia email alert
      const emailSent = await this.emailService.sendLowStockAlert({
        products: lowStockProducts,
        totalProductsLow: lowStockProducts.length,
      });

      if (emailSent) {
        this.logger.log('📧 Email alert low stock inviata ad admin');
      } else {
        this.logger.error('❌ Errore invio email alert low stock');
      }
    } catch (error) {
      this.logger.error('❌ Errore controllo low stock:', error);
    }
  }

  /**
   * Forza invio alert low stock (manuale)
   */
  async sendLowStockAlertNow(): Promise<void> {
    await this.checkLowStockAndAlert();
  }

  /**
   * Recupera varianti sotto soglia minima
   */
  private async getLowStockProducts(): Promise<Array<{
    id: string;
    name: string;
    sku: string;
    currentStock: number;
    reservedStock: number;
    availableStock: number;
    minStockThreshold: number;
    category?: string;
    price?: number;
  }>> {
    const variants = await this.variantRepository.find({
      where: { isActive: true },
      relations: ['product', 'product.category'],
    });

    const lowStockVariants = variants
      .filter(variant => variant.availableStock <= 5)
      .map(variant => ({
        id: variant.id,
        name: variant.product?.name ?? variant.sku,
        sku: variant.sku,
        currentStock: variant.stock,
        reservedStock: variant.reservedStock || 0,
        availableStock: variant.availableStock,
        minStockThreshold: 5,
        category: variant.product?.category?.name,
        price: variant.effectivePrice,
      }));

    return lowStockVariants.sort((a, b) => {
      // Ordina: out of stock prima, poi per available stock
      if (a.availableStock === 0 && b.availableStock !== 0) return -1;
      if (a.availableStock !== 0 && b.availableStock === 0) return 1;
      return a.availableStock - b.availableStock;
    });
  }

  // ===========================
  // 🛠️ PRIVATE HELPER METHODS
  // ===========================

  /**
   * Registra stock iniziale alla creazione variante
   */
  async recordInitialStock(
    variantId: string,
    quantity: number,
    manager?: EntityManager
  ): Promise<void> {
    const execute = async (mgr: EntityManager) => {
      const movement = mgr.create(InventoryMovement, {
        variantId,
        movementType: InventoryMovementType.IN,
        quantity,
        quantityBefore: 0,
        quantityAfter: quantity,
        reason: 'Stock iniziale variante',
        notes: `Variante creata con stock iniziale: ${quantity}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await mgr.save(InventoryMovement, movement);

      this.logger.log(
        `📦 Inventory movement creato: Stock iniziale ${quantity} per variante ${variantId}`
      );
    };

    if (manager) {
      await execute(manager);
    } else {
      await this.dataSource.transaction(execute);
    }
  }

  /**
   * Trova variante e stock corrente
   */
  private async _findVariantAndStock(
    variantId: string,
    manager: EntityManager
  ) {
    const variant = await manager.findOne(ProductVariant, {
      where: { id: variantId }
    });

    if (!variant) {
      throw new NotFoundException(`Variante ${variantId} non trovata`);
    }

    const quantityBefore = variant.stock;
    return { variant, quantityBefore };
  }

  /**
   * Determina direzione movimento (+ o -)
   */
  private _determineActualMovement(
    type: InventoryMovementType,
    quantity: number
  ): number {
    const isOutgoing = [
      InventoryMovementType.OUT,
      InventoryMovementType.SALE,
      InventoryMovementType.DAMAGE,
    ].includes(type);

    return isOutgoing ? -Math.abs(quantity) : Math.abs(quantity);
  }

  /**
   * Calcola nuovo stock dopo movimento
   */
  private _calculateNewStock(
    before: number,
    movement: number,
    type: InventoryMovementType
  ): number {
    if (type === InventoryMovementType.ADJUSTMENT) {
      // ADJUSTMENT: quantity è il valore target assoluto
      return Math.max(0, movement);
    }
    return before + movement;
  }

  /**
   * Registra movimento e aggiorna variante
   */
  private async _recordMovementAndUpdateStock(data: {
    manager: EntityManager;
    variant: ProductVariant;
    quantityBefore: number;
    quantityAfter: number;
    actualMovement: number;
    updateStockDto: UpdateStockInventroryDto;
    userId?: string;
  }) {
    const { manager, variant, ...rest } = data;

    // Crea movimento
    const inventoryMovement = manager.create(InventoryMovement, {
      variantId: variant.id,
      userId: rest.userId,
      movementType: rest.updateStockDto.movementType,
      quantity: rest.actualMovement,
      quantityBefore: rest.quantityBefore,
      quantityAfter: rest.quantityAfter,
      unitCost: rest.updateStockDto.unitCost,
      reason: rest.updateStockDto.reason,
      notes: rest.updateStockDto.notes,
      batchNumber: rest.updateStockDto.batchNumber,
      orderId: (rest.updateStockDto as any)?.orderId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedMovement = await manager.save(InventoryMovement, inventoryMovement);

    // Aggiorna stock variante
    await manager.update(ProductVariant, variant.id, { stock: rest.quantityAfter });

    // Ritorna movimento con relazioni
    return manager.findOne(InventoryMovement, {
      where: { id: savedMovement.id },
      relations: ['variant', 'variant.product', 'user']
    });
  }

  /**
   * Applica filtri a query movimenti
   */
  private applyMovementFilters(
    queryBuilder: any,
    filterDto: StockMovementFilterDto
  ): void {
    if (filterDto.variantId) {
      queryBuilder.andWhere('inventory.variantId = :variantId', {
        variantId: filterDto.variantId
      });
    }

    if (filterDto.movementType) {
      queryBuilder.andWhere('inventory.movementType = :movementType', {
        movementType: filterDto.movementType
      });
    }

    if (filterDto.dateFrom && filterDto.dateTo) {
      queryBuilder.andWhere('inventory.createdAt BETWEEN :dateFrom AND :dateTo', {
        dateFrom: new Date(filterDto.dateFrom),
        dateTo: new Date(filterDto.dateTo),
      });
    } else if (filterDto.dateFrom) {
      queryBuilder.andWhere('inventory.createdAt >= :dateFrom', {
        dateFrom: new Date(filterDto.dateFrom),
      });
    } else if (filterDto.dateTo) {
      queryBuilder.andWhere('inventory.createdAt <= :dateTo', {
        dateTo: new Date(filterDto.dateTo),
      });
    }

    if (filterDto.userId) {
      queryBuilder.andWhere('inventory.userId = :userId', {
        userId: filterDto.userId
      });
    }

    if ((filterDto as any).batchNumber) {
      queryBuilder.andWhere('inventory.batchNumber = :batchNumber', {
        batchNumber: (filterDto as any).batchNumber
      });
    }

    if ((filterDto as any).orderId) {
      queryBuilder.andWhere('inventory.orderId = :orderId', {
        orderId: (filterDto as any).orderId
      });
    }
  }
}
