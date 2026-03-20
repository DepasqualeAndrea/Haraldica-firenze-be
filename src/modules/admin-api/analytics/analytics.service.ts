import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics-query.dto';
import { SalesReportDto } from './dto/sales-report.dto';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Payment } from 'src/database/entities/payment.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { User, UserRole } from 'src/database/entities/user.entity';

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  averageOrderValue: number;
  conversionRate: number;
  topVariants: Array<{
    variantId: string;
    productName: string;
    sku: string;
    size: string;
    colorName: string;
    totalSold: number;
    revenue: number;
  }>;
  recentOrders: Order[];
  revenueGrowth: number;
  ordersGrowth: number;
  customersGrowth: number;
}

const COMPLETED_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  async getDashboardStats(queryDto: AnalyticsQueryDto = {}): Promise<DashboardStats> {
    const { startDate, endDate } = this.getDateRange(
      queryDto.period || AnalyticsPeriod.LAST_30_DAYS,
      queryDto,
    );
    const previousPeriod = this.getPreviousPeriod(startDate, endDate);

    const [
      currentRevenue,
      currentOrders,
      currentCustomers,
      topVariants,
      recentOrders,
    ] = await Promise.all([
      this.getRevenue(startDate, endDate),
      this.getOrdersCount(startDate, endDate),
      this.getCustomersCount(startDate, endDate),
      this.getTopVariants(startDate, endDate, 5),
      this.getRecentOrders(10),
    ]);

    const [previousRevenue, previousOrders, previousCustomers] =
      await Promise.all([
        this.getRevenue(previousPeriod.startDate, previousPeriod.endDate),
        this.getOrdersCount(previousPeriod.startDate, previousPeriod.endDate),
        this.getCustomersCount(previousPeriod.startDate, previousPeriod.endDate),
      ]);

    const averageOrderValue =
      currentOrders > 0 ? currentRevenue / currentOrders : 0;
    const conversionRate = await this.getConversionRate(startDate, endDate);

    return {
      totalRevenue: Math.round(currentRevenue * 100) / 100,
      totalOrders: currentOrders,
      totalCustomers: currentCustomers,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      topVariants,
      recentOrders,
      revenueGrowth: Math.round(this.calculateGrowthRate(currentRevenue, previousRevenue) * 100) / 100,
      ordersGrowth: Math.round(this.calculateGrowthRate(currentOrders, previousOrders) * 100) / 100,
      customersGrowth: Math.round(this.calculateGrowthRate(currentCustomers, previousCustomers) * 100) / 100,
    };
  }

  async getSalesReport(reportDto: SalesReportDto): Promise<{
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    data: Array<{
      period: string;
      revenue: number;
      orders: number;
      averageOrderValue: number;
    }>;
    topVariants: Array<{
      variantId: string;
      productName: string;
      sku: string;
      size: string;
      colorName: string;
      quantity: number;
      revenue: number;
    }>;
  }> {
    const { startDate, endDate } =
      reportDto.startDate && reportDto.endDate
        ? {
            startDate: new Date(reportDto.startDate),
            endDate: new Date(reportDto.endDate),
          }
        : this.getDateRange(AnalyticsPeriod.LAST_30_DAYS);

    const [totalRevenue, totalOrders, salesData, topVariants] =
      await Promise.all([
        this.getRevenue(startDate, endDate),
        this.getOrdersCount(startDate, endDate),
        this.getSalesDataByPeriod(startDate, endDate, reportDto.groupBy || 'day'),
        this.getTopVariantsSales(startDate, endDate, reportDto.limit || 10),
      ]);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      averageOrderValue:
        totalOrders > 0
          ? Math.round((totalRevenue / totalOrders) * 100) / 100
          : 0,
      data: salesData,
      topVariants,
    };
  }

  async getVariantAnalytics(
    variantId: string,
    queryDto: AnalyticsQueryDto = {},
  ): Promise<{
    variantId: string;
    sku: string;
    size: string;
    colorName: string;
    productName: string;
    totalSold: number;
    totalRevenue: number;
    salesTrend: Array<{
      date: string;
      quantity: number;
      revenue: number;
    }>;
  }> {
    const { startDate, endDate } = this.getDateRange(
      queryDto.period || AnalyticsPeriod.LAST_30_DAYS,
      queryDto,
    );

    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['product'],
    });

    if (!variant) {
      throw new Error('Variante non trovata');
    }

    const [salesData, salesTrend] = await Promise.all([
      this.getVariantSalesData(variantId, startDate, endDate),
      this.getVariantSalesTrend(variantId, startDate, endDate),
    ]);

    return {
      variantId: variant.id,
      sku: variant.sku,
      size: variant.size,
      colorName: variant.colorName,
      productName: variant.product?.name || 'N/A',
      totalSold: salesData.totalSold,
      totalRevenue: Math.round(salesData.totalRevenue * 100) / 100,
      salesTrend,
    };
  }

  async getCustomerAnalytics(queryDto: AnalyticsQueryDto = {}): Promise<{
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    averageLifetimeValue: number;
    customerSegments: Array<{
      segment: string;
      count: number;
      percentage: number;
    }>;
  }> {
    const { startDate, endDate } = this.getDateRange(
      queryDto.period || AnalyticsPeriod.LAST_30_DAYS,
      queryDto,
    );

    const [totalCustomers, newCustomers, returningCustomers, lifetimeValues] =
      await Promise.all([
        this.userRepository.count({ where: { role: UserRole.CUSTOMER } }),
        this.userRepository.count({
          where: {
            role: UserRole.CUSTOMER,
            createdAt: Between(startDate, endDate),
          },
        }),
        this.getReturningCustomersCount(startDate, endDate),
        this.getCustomerLifetimeValues(),
      ]);

    const averageLifetimeValue =
      lifetimeValues.length > 0
        ? lifetimeValues.reduce((sum, val) => sum + val, 0) /
          lifetimeValues.length
        : 0;

    const customerSegments = this.calculateCustomerSegments(lifetimeValues);

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      averageLifetimeValue: Math.round(averageLifetimeValue * 100) / 100,
      customerSegments,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getRevenue(startDate: Date, endDate: Date): Promise<number> {
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total)', 'total')
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  private async getOrdersCount(startDate: Date, endDate: Date): Promise<number> {
    return this.orderRepository.count({
      where: {
        status: In(COMPLETED_STATUSES),
        createdAt: Between(startDate, endDate),
      },
    });
  }

  private async getCustomersCount(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return this.userRepository.count({
      where: {
        role: UserRole.CUSTOMER,
        createdAt: Between(startDate, endDate),
      },
    });
  }

  /**
   * Top varianti per quantità venduta nel periodo.
   * Raggruppa per variantId e arricchisce con i dati della variante e del prodotto padre.
   */
  private async getTopVariants(
    startDate: Date,
    endDate: Date,
    limit: number = 5,
  ): Promise<DashboardStats['topVariants']> {
    const result = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.order', 'order')
      .leftJoin('orderItem.variant', 'variant')
      .leftJoin('variant.product', 'product')
      .select([
        'orderItem.variantId AS "variantId"',
        'variant.sku AS sku',
        'variant.size AS size',
        'variant.colorName AS "colorName"',
        'product.name AS "productName"',
        'SUM(orderItem.quantity) AS "totalSold"',
        'SUM(orderItem.total) AS revenue',
      ])
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy(
        'orderItem.variantId, variant.sku, variant.size, variant.colorName, product.name',
      )
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((row) => ({
      variantId: row.variantId,
      productName: row.productName || 'N/A',
      sku: row.sku || 'N/A',
      size: row.size || 'N/A',
      colorName: row.colorName || 'N/A',
      totalSold: parseInt(row.totalSold, 10),
      revenue: parseFloat(row.revenue),
    }));
  }

  private async getRecentOrders(limit: number = 10): Promise<Order[]> {
    return this.orderRepository.find({
      relations: ['user', 'items', 'items.variant', 'items.variant.product'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private async getConversionRate(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const [potentialCustomers, actualCustomers] = await Promise.all([
      this.userRepository.count({
        where: {
          role: UserRole.CUSTOMER,
          createdAt: Between(startDate, endDate),
        },
      }),
      this.orderRepository.count({
        where: {
          status: In(COMPLETED_STATUSES),
          createdAt: Between(startDate, endDate),
        },
      }),
    ]);

    return potentialCustomers > 0
      ? (actualCustomers / potentialCustomers) * 100
      : 0;
  }

  private getDateRange(
    period: AnalyticsPeriod,
    queryDto?: AnalyticsQueryDto,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );
    let startDate = new Date();

    switch (period) {
      case AnalyticsPeriod.TODAY:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case AnalyticsPeriod.YESTERDAY:
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        );
        endDate.setDate(endDate.getDate() - 1);
        break;
      case AnalyticsPeriod.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case AnalyticsPeriod.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case AnalyticsPeriod.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case AnalyticsPeriod.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case AnalyticsPeriod.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate.setMonth(endDate.getMonth() - 1);
        endDate.setDate(0);
        break;
      case AnalyticsPeriod.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case AnalyticsPeriod.CUSTOM:
        if (queryDto?.startDate && queryDto?.endDate) {
          return {
            startDate: new Date(queryDto.startDate),
            endDate: new Date(queryDto.endDate),
          };
        }
        break;
    }

    return { startDate, endDate };
  }

  private getPreviousPeriod(
    startDate: Date,
    endDate: Date,
  ): { startDate: Date; endDate: Date } {
    const duration = endDate.getTime() - startDate.getTime();
    return {
      startDate: new Date(startDate.getTime() - duration),
      endDate: new Date(startDate.getTime() - 1),
    };
  }

  private calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private async getSalesDataByPeriod(
    startDate: Date,
    endDate: Date,
    _groupBy: string,
  ) {
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select([
        'DATE(order.createdAt) AS date',
        'SUM(order.total) AS revenue',
        'COUNT(*) AS orders',
      ])
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    return result.map((item) => ({
      period: item.date,
      revenue: parseFloat(item.revenue),
      orders: parseInt(item.orders, 10),
      averageOrderValue:
        parseInt(item.orders, 10) > 0
          ? parseFloat(item.revenue) / parseInt(item.orders, 10)
          : 0,
    }));
  }

  /**
   * Top varianti per report vendite — include dettagli taglia/colore/SKU.
   */
  private async getTopVariantsSales(
    startDate: Date,
    endDate: Date,
    limit: number,
  ) {
    const result = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.order', 'order')
      .leftJoin('orderItem.variant', 'variant')
      .leftJoin('variant.product', 'product')
      .select([
        'orderItem.variantId AS "variantId"',
        'product.name AS "productName"',
        'variant.sku AS sku',
        'variant.size AS size',
        'variant.colorName AS "colorName"',
        'SUM(orderItem.quantity) AS quantity',
        'SUM(orderItem.total) AS revenue',
      ])
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy(
        'orderItem.variantId, product.name, variant.sku, variant.size, variant.colorName',
      )
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(limit)
      .getRawMany();

    return result.map((item) => ({
      variantId: item.variantId,
      productName: item.productName || 'N/A',
      sku: item.sku || 'N/A',
      size: item.size || 'N/A',
      colorName: item.colorName || 'N/A',
      quantity: parseInt(item.quantity, 10),
      revenue: parseFloat(item.revenue),
    }));
  }

  private async getVariantSalesData(
    variantId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const result = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.order', 'order')
      .select([
        'SUM(orderItem.quantity) AS "totalSold"',
        'SUM(orderItem.total) AS "totalRevenue"',
      ])
      .where('orderItem.variantId = :variantId', { variantId })
      .andWhere('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne();

    return {
      totalSold: parseInt(result?.totalSold || '0', 10),
      totalRevenue: parseFloat(result?.totalRevenue || '0'),
    };
  }

  private async getVariantSalesTrend(
    variantId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const result = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.order', 'order')
      .select([
        'DATE(order.createdAt) AS date',
        'SUM(orderItem.quantity) AS quantity',
        'SUM(orderItem.total) AS revenue',
      ])
      .where('orderItem.variantId = :variantId', { variantId })
      .andWhere('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'ASC')
      .getRawMany();

    return result.map((item) => ({
      date: item.date,
      quantity: parseInt(item.quantity, 10),
      revenue: parseFloat(item.revenue),
    }));
  }

  private async getReturningCustomersCount(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'count')
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('COUNT(*)')
          .from(Order, 'prevOrder')
          .where('prevOrder.userId = order.userId')
          .andWhere('prevOrder.createdAt < :startDate', { startDate })
          .getQuery();
        return `(${sub}) > 0`;
      })
      .getRawOne();

    return parseInt(result?.count || '0', 10);
  }

  private async getCustomerLifetimeValues(): Promise<number[]> {
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select(['order.userId AS "userId"', 'SUM(order.total) AS "lifetimeValue"'])
      .where('order.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .groupBy('order.userId')
      .getRawMany();

    return result.map((item) => parseFloat(item.lifetimeValue));
  }

  private calculateCustomerSegments(lifetimeValues: number[]) {
    if (lifetimeValues.length === 0) return [];

    const sorted = [...lifetimeValues].sort((a, b) => a - b);
    const total = sorted.length;

    const lowThreshold = Math.floor(total * 0.33);
    const mediumThreshold = Math.floor(total * 0.66);

    const segments = [
      {
        segment: 'Low Value (0-33%)',
        count: lowThreshold,
        percentage: Math.round((lowThreshold / total) * 100),
      },
      {
        segment: 'Medium Value (34-66%)',
        count: mediumThreshold - lowThreshold,
        percentage: Math.round(((mediumThreshold - lowThreshold) / total) * 100),
      },
      {
        segment: 'High Value (67-100%)',
        count: total - mediumThreshold,
        percentage: Math.round(((total - mediumThreshold) / total) * 100),
      },
    ];

    return segments;
  }

  async trackEvent(
    eventName: string,
    data: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`Tracking event: ${eventName} — ${JSON.stringify(data)}`);
  }
}
