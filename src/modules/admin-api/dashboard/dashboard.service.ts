import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, IsNull } from 'typeorm';

// Entities
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Shipment, ShipmentStatus } from 'src/database/entities/shipment.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';

// DTOs
import { DashboardFilterDto, DashboardStatsDto } from './dto/dashboard.dto';

// Utils
import { getTodayShippingDate, getMinutesUntilAutoConfirm } from 'src/utils/shipping-date.util';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
  ) {}

  /**
   * 📊 Ottieni statistiche dashboard
   */
  async getDashboardStats(filters?: DashboardFilterDto): Promise<DashboardStatsDto> {
    const period = filters?.period || 'all';
    this.logger.log(`📊 [DASHBOARD] Getting stats - Period: ${period}`);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calcola range filtro in base a periodo
    let filterStart: Date | undefined;
    let filterEnd: Date | undefined;

    if (period === 'daily') {
      // Daily: oggi in ora LOCALE (Italia)
      if (filters?.startDate) {
        const customDate = new Date(filters.startDate);
        filterStart = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate(), 0, 0, 0, 0);
        filterEnd = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate(), 23, 59, 59, 999);
      } else {
        filterStart = todayStart;
        filterEnd = todayEnd;
      }
      this.logger.log(`📅 Daily filter: ${filterStart.toISOString()} - ${filterEnd.toISOString()}`);
    } else if (period === 'monthly') {
      if (filters?.startDate) {
        const date = new Date(filters.startDate);
        filterStart = new Date(date.getFullYear(), date.getMonth(), 1);
        filterEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      } else {
        filterStart = monthStart;
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        filterEnd = new Date(monthEnd);
        filterEnd.setHours(23, 59, 59, 999);
      }
    } else if (filters?.startDate && filters?.endDate) {
      // Range personalizzato
      filterStart = new Date(filters.startDate);
      filterEnd = new Date(filters.endDate);
    }
    // Se period='all' o non specificato → nessun filtro (vista globale)

    // 1. STATISTICHE ORDINI
    const orderStats = await this.getOrderStats(todayStart, todayEnd, filterStart, filterEnd);

    // 2. STATISTICHE SPEDIZIONI
    const shipmentStats = await this.getShipmentStats(todayStart, todayEnd, filterStart, filterEnd);

    // 3. STATISTICHE REVENUE
    const revenueStats = await this.getRevenueStats(
      todayStart,
      todayEnd,
      weekStart,
      monthStart,
      filterStart,
      filterEnd,
    );

    // 4. AZIONI RICHIESTE
    const actionRequired = await this.getActionRequired();

    return {
      period,
      dateRange: filterStart && filterEnd ? {
        startDate: filterStart.toISOString(),
        endDate: filterEnd.toISOString(),
      } : undefined,
      orders: orderStats,
      shipments: shipmentStats,
      revenue: revenueStats,
      actionRequired,
      currentShippingDate: getTodayShippingDate(),
    };
  }

  /**
   * Statistiche ordini
   */
  private async getOrderStats(
    todayStart: Date,
    todayEnd: Date,
    filterStart?: Date,
    filterEnd?: Date,
  ) {
    // Se c'è filtro, usa solo ordini filtrati, altrimenti tutti
    const whereFilter: any = {};
    if (filterStart && filterEnd) {
      whereFilter.createdAt = Between(filterStart, filterEnd);
    }

    const allOrders = await this.orderRepository.find({
      where: filterStart && filterEnd ? whereFilter : {},
    });

    const todayOrders = await this.orderRepository.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
      },
    });

    return {
      total: allOrders.length,
      pending: allOrders.filter(o => o.status === OrderStatus.PENDING).length,
      confirmed: allOrders.filter(o => o.status === OrderStatus.CONFIRMED).length,
      processing: allOrders.filter(o => o.status === OrderStatus.PROCESSING).length,
      readyToShip: allOrders.filter(o => o.status === OrderStatus.READY_TO_SHIP).length,
      shipped: allOrders.filter(o => o.status === OrderStatus.SHIPPED).length,
      inTransit: allOrders.filter(o => o.status === OrderStatus.IN_TRANSIT).length,
      delivered: allOrders.filter(o => o.status === OrderStatus.DELIVERED).length,
      cancelled: allOrders.filter(o => o.status === OrderStatus.CANCELLED).length,
      todayCount: todayOrders,
    };
  }

  /**
   * Statistiche spedizioni
   */
  private async getShipmentStats(
    todayStart: Date,
    todayEnd: Date,
    filterStart?: Date,
    filterEnd?: Date,
  ) {
    const whereFilter: any = {};
    if (filterStart && filterEnd) {
      whereFilter.createdAt = Between(filterStart, filterEnd);
    }

    const allShipments = await this.shipmentRepository.find({
      where: filterStart && filterEnd ? whereFilter : {},
      relations: ['order'],
    });

    const todayShipments = await this.shipmentRepository.count({
      where: {
        createdAt: Between(todayStart, todayEnd),
      },
    });

    // Ordini ready-to-ship (con etichetta creata)
    const readyToShip = await this.orderRepository.count({
      where: {
        status: OrderStatus.READY_TO_SHIP,
      },
    });

    // Ordini con spedizione in attesa ritiro (shipment creato ma non ancora SHIPPED)
    const awaitingPickup = allShipments.filter(
      s => s.status === ShipmentStatus.CREATED || s.status === ShipmentStatus.PAID,
    ).length;

    // Spedizioni in transito
    const inTransit = allShipments.filter(
      s => s.status === ShipmentStatus.IN_TRANSIT || s.status === ShipmentStatus.OUT_FOR_DELIVERY,
    ).length;

    // Consegnate
    const delivered = allShipments.filter(s => s.status === ShipmentStatus.DELIVERED).length;

    // Con problemi
    const withIssues = allShipments.filter(s => s.status === ShipmentStatus.EXCEPTION).length;

    return {
      readyToShip,
      awaitingPickup,
      inTransit,
      delivered,
      withIssues,
      todayCreated: todayShipments,
    };
  }

  /**
   * Statistiche revenue
   */
  private async getRevenueStats(
    todayStart: Date,
    todayEnd: Date,
    weekStart: Date,
    monthStart: Date,
    filterStart?: Date,
    filterEnd?: Date,
  ) {
    // Se c'è filtro, usa solo ordini DELIVERED nel range
    const whereFilter: any = {
      status: OrderStatus.DELIVERED,
    };
    if (filterStart && filterEnd) {
      whereFilter.createdAt = Between(filterStart, filterEnd);
    }

    const completedOrders = await this.orderRepository.find({
      where: whereFilter,
    });

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total), 0);

    const todayRevenue = completedOrders
      .filter(o => o.createdAt >= todayStart && o.createdAt < todayEnd)
      .reduce((sum, o) => sum + Number(o.total), 0);

    const weekRevenue = completedOrders
      .filter(o => o.createdAt >= weekStart)
      .reduce((sum, o) => sum + Number(o.total), 0);

    const monthRevenue = completedOrders
      .filter(o => o.createdAt >= monthStart)
      .reduce((sum, o) => sum + Number(o.total), 0);

    const averageOrderValue =
      completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    return {
      total: totalRevenue,
      today: todayRevenue,
      thisWeek: weekRevenue,
      thisMonth: monthRevenue,
      averageOrderValue,
    };
  }

  /**
   * Azioni richieste
   */
  private async getActionRequired() {
    // Ordini CONFIRMED senza shipment
    const ordersNeedingShipment = await this.orderRepository.count({
      where: {
        status: OrderStatus.CONFIRMED,
        shipmentId: IsNull(),
      },
    });

    // Ordini vicini all'auto-conferma (< 15 minuti)
    const confirmedOrders = await this.orderRepository.find({
      where: {
        status: OrderStatus.CONFIRMED,
        shipmentId: IsNull(),
      },
    });

    const ordersNearAutoConfirm = confirmedOrders.filter(order => {
      const minutesRemaining = getMinutesUntilAutoConfirm(order.createdAt);
      return minutesRemaining > 0 && minutesRemaining <= 15;
    }).length;

    // Spedizioni con problemi
    const shipmentsWithIssues = await this.shipmentRepository.count({
      where: {
        status: ShipmentStatus.EXCEPTION,
      },
    });

    // Varianti con stock basso (disponibile ≤ 5)
    const lowStockProducts = await this.variantRepository
      .createQueryBuilder('v')
      .where('v.isActive = true')
      .andWhere('(v.stock - COALESCE(v.reservedStock, 0)) <= 5')
      .getCount();

    return {
      ordersNeedingShipment,
      ordersNearAutoConfirm,
      shipmentsWithIssues,
      lowStockProducts,
    };
  }
}
