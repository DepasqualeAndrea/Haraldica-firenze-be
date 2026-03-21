// src/modules/admin-api/shipments/shipments.controller.ts

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';

// Services
import { ShipmentsService } from 'src/modules/public-api/brt/shipments/shipments.service';
import { ShipmentExportService } from './shipment-export.service';
import {
  CreateBrtShipmentDto,
  ConfirmBrtShipmentDto,
  BulkConfirmBrtShipmentsDto,
  DeleteBrtShipmentDto,
  TrackBrtShipmentDto,
  GetReadyToShipDto,
} from 'src/modules/public-api/brt/dto/create-brt-shipment.dto';
import {
  ShipmentDateFilterDto,
  ShipmentExportDto,
  ShipmentDetailResponseDto,
} from './dto/shipment-admin.dto';
import { ApiOperation } from '@nestjs/swagger';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Between, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from 'src/database/entities/shipment.entity';
import { calculateShippingDate, getShippingDateRange, getMinutesUntilAutoConfirm } from 'src/utils/shipping-date.util';

@Controller('admin/shipments')
@RequireAdmin()
export class ShipmentsController {
  private readonly logger = new Logger(ShipmentsController.name);

  /**
   * Mappa province italiane (nome → sigla)
   */
  private readonly provinceMap: Record<string, string> = {
    'AGRIGENTO': 'AG', 'ALESSANDRIA': 'AL', 'ANCONA': 'AN', 'AOSTA': 'AO',
    'AREZZO': 'AR', 'ASCOLI PICENO': 'AP', 'ASTI': 'AT', 'AVELLINO': 'AV',
    'BARI': 'BA', 'BARLETTA-ANDRIA-TRANI': 'BT', 'BELLUNO': 'BL', 'BENEVENTO': 'BN',
    'BERGAMO': 'BG', 'BIELLA': 'BI', 'BOLOGNA': 'BO', 'BOLZANO': 'BZ',
    'BRESCIA': 'BS', 'BRINDISI': 'BR', 'CAGLIARI': 'CA', 'CALTANISSETTA': 'CL',
    'CAMPOBASSO': 'CB', 'CASERTA': 'CE', 'CATANIA': 'CT', 'CATANZARO': 'CZ',
    'CHIETI': 'CH', 'COMO': 'CO', 'COSENZA': 'CS', 'CREMONA': 'CR',
    'CROTONE': 'KR', 'CUNEO': 'CN', 'ENNA': 'EN', 'FERMO': 'FM',
    'FERRARA': 'FE', 'FIRENZE': 'FI', 'FOGGIA': 'FG', 'FORLI-CESENA': 'FC',
    'FROSINONE': 'FR', 'GENOVA': 'GE', 'GORIZIA': 'GO', 'GROSSETO': 'GR',
    'IMPERIA': 'IM', 'ISERNIA': 'IS', 'L\'AQUILA': 'AQ', 'LA SPEZIA': 'SP',
    'LATINA': 'LT', 'LECCE': 'LE', 'LECCO': 'LC', 'LIVORNO': 'LI',
    'LODI': 'LO', 'LUCCA': 'LU', 'MACERATA': 'MC', 'MANTOVA': 'MN',
    'MASSA-CARRARA': 'MS', 'MATERA': 'MT', 'MESSINA': 'ME', 'MILANO': 'MI',
    'MODENA': 'MO', 'MONZA E BRIANZA': 'MB', 'NAPOLI': 'NA', 'NOVARA': 'NO',
    'NUORO': 'NU', 'ORISTANO': 'OR', 'PADOVA': 'PD', 'PALERMO': 'PA',
    'PARMA': 'PR', 'PAVIA': 'PV', 'PERUGIA': 'PG', 'PESARO E URBINO': 'PU',
    'PESCARA': 'PE', 'PIACENZA': 'PC', 'PISA': 'PI', 'PISTOIA': 'PT',
    'PORDENONE': 'PN', 'POTENZA': 'PZ', 'PRATO': 'PO', 'RAGUSA': 'RG',
    'RAVENNA': 'RA', 'REGGIO CALABRIA': 'RC', 'REGGIO EMILIA': 'RE', 'RIETI': 'RI',
    'RIMINI': 'RN', 'ROMA': 'RM', 'ROVIGO': 'RO', 'SALERNO': 'SA',
    'SASSARI': 'SS', 'SAVONA': 'SV', 'SIENA': 'SI', 'SIRACUSA': 'SR',
    'SONDRIO': 'SO', 'SUD SARDEGNA': 'SU', 'TARANTO': 'TA', 'TERAMO': 'TE',
    'TERNI': 'TR', 'TORINO': 'TO', 'TRAPANI': 'TP', 'TRENTO': 'TN',
    'TREVISO': 'TV', 'TRIESTE': 'TS', 'UDINE': 'UD', 'VARESE': 'VA',
    'VENEZIA': 'VE', 'VERBANO-CUSIO-OSSOLA': 'VB', 'VERCELLI': 'VC', 'VERONA': 'VR',
    'VIBO VALENTIA': 'VV', 'VICENZA': 'VI', 'VITERBO': 'VT',
  };

  /**
   * Estrae il codice provincia (2 lettere) dall'indirizzo
   */
  private extractProvinceCode(address: any): string | undefined {
    if (!address) return undefined;

    // Priorità 1: provinceCode già a 2 caratteri
    if (address.provinceCode?.length === 2) {
      return address.provinceCode.toUpperCase();
    }

    // Priorità 2: Mappa provinceCode (es. "Ascoli Piceno" → "AP")
    if (address.provinceCode) {
      const normalized = address.provinceCode.toUpperCase().trim();
      const sigla = this.provinceMap[normalized];
      if (sigla) return sigla;
    }

    // Priorità 3: Mappa province (es. "ASCOLI PICENO" → "AP")
    if (address.province) {
      const normalized = address.province.toUpperCase().trim();
      const sigla = this.provinceMap[normalized];
      if (sigla) return sigla;
    }

    // Priorità 4: Estrai da city formato "Castel di Lama (AP)"
    if (address.city) {
      const match = address.city.match(/\(([A-Z]{2})\)/);
      if (match) return match[1];
    }

    // Fallback: undefined (nessun codice trovato)
    return undefined;
  }

  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly shipmentExportService: ShipmentExportService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
  ) { }

  // ===========================
  // 📦 CREATE SHIPMENTS
  // ===========================

  /**
   * POST /admin/shipments/create/:orderId
   * Crea spedizione BRT per singolo ordine
   */
  @Post('create/:orderId')
  async createShipment(
    @Param('orderId') orderId: string,
    @Body() dto: CreateBrtShipmentDto,
  ) {
    this.logger.log(`📦 [API] Create shipment request: ${orderId}`);

    const response = await this.shipmentsService.createShipmentForOrder(orderId, {
      generateLabel: dto.generateLabel ?? true,
      notes: dto.notes,
    });

    return {
      success: true,
      message: 'Spedizione creata con successo',
      data: response,
    };
  }

  /**
   * POST /admin/shipments/bulk-create
   * Crea spedizioni BRT per ordini multipli
   */
  @Post('bulk-create')
  async bulkCreateShipments(@Body() dto: { orderIds: string[] }) {
    this.logger.log(`📦 [API] Bulk create shipments: ${dto.orderIds.length} ordini`);

    const response = await this.shipmentsService.bulkCreateShipments(dto.orderIds);

    return {
      success: true,
      message: `Bulk create completato: ${response.success} successi, ${response.failed} falliti`,
      data: response,
    };
  }

  // ===========================
  // ✅ CONFIRM SHIPMENTS
  // ===========================

  /**
   * POST /admin/shipments/confirm/:orderId
   * Conferma spedizione BRT dopo ritiro corriere
   */
  @Post('confirm/:orderId')
  async confirmShipment(
    @Param('orderId') orderId: string,
    @Body() dto?: ConfirmBrtShipmentDto,
  ) {
    this.logger.log(`✅ [API] Confirm shipment request: ${orderId}`);

    const response = await this.shipmentsService.confirmShipment(orderId, dto);

    return {
      success: true,
      message: response.message,
    };
  }

  /**
   * POST /admin/shipments/bulk-confirm
   * Conferma spedizioni multiple dopo ritiro corriere
   */
  @Post('bulk-confirm')
  async bulkConfirmShipments(@Body() dto: BulkConfirmBrtShipmentsDto) {
    this.logger.log(`✅ [API] Bulk confirm shipments: ${dto.orderIds.length} ordini`);

    const response = await this.shipmentsService.bulkConfirmShipments(dto);

    return {
      success: true,
      message: `Bulk confirm completato: ${response.success} confermati, ${response.failed} falliti`,
      data: response,
    };
  }

  // ===========================
  // 🗑️ DELETE SHIPMENTS
  // ===========================

  /**
   * DELETE /admin/shipments/:orderId
   * Cancella spedizione BRT (solo pre-ritiro)
   */
  @Delete(':orderId')
  async deleteShipment(
    @Param('orderId') orderId: string,
    @Body() dto: DeleteBrtShipmentDto,
  ) {
    this.logger.log(`🗑️ [API] Delete shipment request: ${orderId}`);

    const response = await this.shipmentsService.deleteShipment(orderId, dto);

    return {
      success: true,
      message: response.message,
    };
  }

  // ===========================
  // 📊 TRACKING & QUERIES
  // ===========================

  /**
   * GET /admin/shipments/tracking
   * Ottieni tracking info per ordine
   */
  @Get('tracking')
  async getTracking(@Query() dto: TrackBrtShipmentDto) {
    this.logger.log(
      `📊 [API] Get tracking: ${dto.orderId || dto.trackingNumber}`,
    );

    const trackingInfo = await this.shipmentsService.getTracking(dto);

    return {
      success: true,
      data: trackingInfo,
    };
  }

  /**
   * GET /admin/shipments/ready-to-ship
   * Ottieni ordini pronti per conferma spedizione
   */
  @Get('ready-to-ship')
  async getReadyToShip(@Query() dto: GetReadyToShipDto) {
    this.logger.log(`📋 [API] Get ready-to-ship orders`);

    // Passa DTO direttamente - il service gestisce la conversione
    const orders = await this.shipmentsService.getReadyToShipOrders(dto);

    return {
      success: true,
      count: orders.length,
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        brtShipmentId: order.brtShipmentId,
        brtTrackingNumber: order.brtTrackingNumber,
        total: order.total,
        customerEmail: order.customerEmail || order.user?.email,
        shippingAddress: order.shippingAddress ? {
          ...order.shippingAddress,
          provinceCode: this.extractProvinceCode(order.shippingAddress),
        } : null,
        createdAt: order.createdAt,
        items: order.items?.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
        })) || [],
      })),
    };
  }


  @Get('shipped-orders')
  async getShippedOrders(@Query() dto?: GetReadyToShipDto) {
    this.logger.log(`📋 [API] Get shipped orders`);

    const query = this.shipmentsService['orderRepository']
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.user', 'user')
      .where('order.status IN (:...statuses)', {
        statuses: [OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT]
      })
      .orderBy('order.updatedAt', 'DESC');

    if (dto?.startDate) {
      query.andWhere('order.updatedAt >= :startDate', {
        startDate: new Date(dto.startDate),
      });
    }

    if (dto?.endDate) {
      query.andWhere('order.updatedAt <= :endDate', {
        endDate: new Date(dto.endDate),
      });
    }

    const limit = dto?.limit || 100;
    query.take(limit);

    const orders = await query.getMany();

    return {
      success: true,
      count: orders.length,
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        customerEmail: order.customerEmail || order.user?.email,
        createdAt: order.createdAt,
        shippingAddress: order.shippingAddress,
        brtShipmentId: order.brtShipmentId,
        brtTrackingNumber: order.brtTrackingNumber,
        items: order.items?.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          weight: (item.variant?.product as any)?.weight || 0.5,
        })) || [],
      })),
    };
  }

  /**
   * GET /admin/shipments/needs-creation
   * Ottieni ordini confermati che necessitano spedizione
   */
  @Get('needs-creation')
  async getOrdersNeedingShipment(@Query() dto: GetReadyToShipDto) {
    this.logger.log(`📋 [API] Get orders needing shipment`);

    const filters = {
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    };

    const orders = await this.shipmentsService.getOrdersNeedingShipment(filters);

    return {
      success: true,
      count: orders.length,
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        shippingAddress: order.shippingAddress,
        items: order.items?.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          weight: (item.variant?.product as any)?.weight || 0.5,
        })) || [],
      })),
    };
  }

  /**
   * POST /admin/shipments/update-tracking
   * Trigger manuale aggiornamento tracking
   */
  @Post('update-tracking')
  async updateTracking() {
    this.logger.log(`🔄 [API] Manual tracking update triggered`);

    const result = await this.shipmentsService.updateShipmentsTracking();

    return {
      success: true,
      message: `Tracking update completato: ${result.updated} aggiornati, ${result.unchanged} invariati, ${result.errors} errori`,
      data: result,
    };
  }

  @Get('label/:orderId')
  @ApiOperation({ summary: 'Download etichetta BRT per ordine' })
  async downloadLabel(@Param('orderId') orderId: string): Promise<{ downloadUrl: string }> {
    const signedUrl = await this.shipmentsService.downloadLabel(orderId);

    return {
      downloadUrl: signedUrl,
    };
  }

  @Post('batch-create')
  async batchCreateShipments(
    @Body() dto?: {
      date?: string;
      orderIds?: string[];
      generateLabel?: boolean;
    }
  ) {
    this.logger.log(`📦 [API] Batch create shipments`);

    let orders: Order[];

    if (dto?.orderIds && dto.orderIds.length > 0) {
      this.logger.log(`   ├─ Mode: Specific orders (${dto.orderIds.length})`);

      orders = await this.shipmentsService['orderRepository'].find({
        where: {
          id: In(dto.orderIds),
          status: OrderStatus.CONFIRMED,
        },
        relations: ['items', 'items.variant', 'items.variant.product', 'user'],
      });

      if (orders.length === 0) {
        return {
          success: false,
          message: 'Nessun ordine CONFIRMED trovato con gli ID specificati',
          data: { success: 0, failed: 0, results: [] },
        };
      }

      this.logger.log(`   ├─ Found: ${orders.length} orders`);
    } else {
      const targetDate = dto?.date ? new Date(dto.date) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      this.logger.log(`   ├─ Mode: All CONFIRMED orders`);
      this.logger.log(`   ├─ Date: ${targetDate.toISOString().split('T')[0]}`);

      orders = await this.shipmentsService['orderRepository'].find({
        where: {
          status: OrderStatus.CONFIRMED,
          createdAt: Between(targetDate, nextDate),
        },
        relations: ['items', 'items.variant', 'items.variant.product', 'user'],
        order: { createdAt: 'ASC' },
      });

      if (orders.length === 0) {
        return {
          success: true,
          message: `Nessun ordine CONFIRMED trovato per ${targetDate.toISOString().split('T')[0]}`,
          data: { success: 0, failed: 0, results: [] },
        };
      }

      this.logger.log(`   └─ Found: ${orders.length} orders`);
    }

    const results: Array<{
      orderId: string;
      orderNumber: string;
      success: boolean;
      trackingNumber?: string;
      parcelID?: string;
      labelUrl?: string;
      error?: string;
    }> = [];
    let success = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        this.logger.log(`📦 Processing order: ${order.orderNumber}`);

        const shipment = await this.shipmentsService.createShipmentForOrder(
          order.id,
          {
            generateLabel: dto?.generateLabel ?? true,
            notes: 'Batch creation',
          }
        );

        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          success: true,
          trackingNumber: shipment.trackingNumber,
          parcelID: shipment.parcelID,
          labelUrl: shipment.labelUrl,
        });

        success++;
        this.logger.log(`   ✅ Success: ${order.orderNumber} → ${shipment.trackingNumber}`);
      } catch (error) {
        this.logger.error(`   ❌ Error for ${order.orderNumber}: ${error.message}`);

        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          success: false,
          error: error.message,
        });

        failed++;
      }
    }

    this.logger.log(
      `✅ [BATCH CREATE] COMPLETED - Success: ${success}/${orders.length}, Failed: ${failed}`
    );

    return {
      success: true,
      message: `Batch create completato: ${success} successi, ${failed} falliti`,
      data: {
        success,
        failed,
        total: orders.length,
        results
      },
    };
  }

  /**
   * GET /admin/shipments/confirmed-orders
   * Lista ordini CONFIRMED (pronti per creare spedizione)
   * 
   * Usato da UI per mostrare ordini disponibili per batch-create
   */
  @Get('confirmed-orders')
  async getConfirmedOrders(@Query() dto?: GetReadyToShipDto) {
    this.logger.log(`📋 [API] Get confirmed orders`);

    const query = this.shipmentsService['orderRepository']
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.user', 'user')
      .where('order.status = :status', { status: OrderStatus.CONFIRMED })
      .orderBy('order.createdAt', 'ASC');

    if (dto?.startDate) {
      query.andWhere('order.createdAt >= :startDate', {
        startDate: new Date(dto.startDate),
      });
    }

    if (dto?.endDate) {
      query.andWhere('order.createdAt <= :endDate', {
        endDate: new Date(dto.endDate),
      });
    }

    const limit = dto?.limit || 100;
    query.take(limit);

    const orders = await query.getMany();

    return {
      success: true,
      count: orders.length,
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        customerEmail: order.customerEmail || order.user?.email,
        createdAt: order.createdAt,
        shippingAddress: order.shippingAddress ? {
          ...order.shippingAddress,
          provinceCode: this.extractProvinceCode(order.shippingAddress),
        } : null,
        items: order.items?.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          weight: (item.variant?.product as any)?.weight || 0.5,
        })) || [],
      })),
    };
  }

  // ===========================
  // 📅 FILTER BY SHIPPING DATE
  // ===========================

  /**
   * 🆕 GET /admin/shipments/by-shipping-date
   * Filtra ordini per data spedizione (cut-off 19:00)
   */
  @Get('by-shipping-date')
  @ApiOperation({ summary: 'Ordini per data spedizione (cut-off 19:00)' })
  async getOrdersByShippingDate(@Query() dto: ShipmentDateFilterDto) {
    this.logger.log(`📅 [API] Get orders by shipping date: ${dto.shippingDate}`);

    if (!dto.shippingDate) {
      return {
        success: false,
        message: 'shippingDate required (YYYY-MM-DD)',
      };
    }

    const { startDate, endDate } = getShippingDateRange(dto.shippingDate);

    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.shipment', 'shipment')
      .where('order.status IN (:...statuses)', {
        statuses: [
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.READY_TO_SHIP,
        ],
      })
      .andWhere('order.createdAt >= :startDate', { startDate })
      .andWhere('order.createdAt <= :endDate', { endDate })
      .orderBy('order.createdAt', 'ASC')
      .getMany();

    return {
      success: true,
      count: orders.length,
      shippingDate: dto.shippingDate,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress,
        hasShipment: !!order.shipment,
        brtTrackingNumber: order.brtTrackingNumber,
        canBeModified: order.canBeModified(),
        minutesUntilAutoConfirm: getMinutesUntilAutoConfirm(order.createdAt),
        items: order.items?.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
        })) || [],
      })),
    };
  }

  // ===========================
  // 📄 EXPORT PDF/CSV
  // ===========================

  /**
   * 🆕 GET /admin/shipments/export/pdf
   * Export PDF spedizioni per data
   */
  @Get('export/pdf')
  @ApiOperation({ summary: 'Export PDF spedizioni per giorno' })
  async exportShipmentsPdf(
    @Query() dto: ShipmentExportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.logger.log(`📄 [API] Export shipments PDF: ${dto.shippingDate}`);

    if (!dto.shippingDate) {
      throw new Error('shippingDate required (YYYY-MM-DD)');
    }

    const pdfBuffer = await this.shipmentExportService.generateShipmentsPDF(
      dto.shippingDate,
    );

    const filename = `spedizioni-${dto.shippingDate}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
    });

    return new StreamableFile(Readable.from(pdfBuffer));
  }

  /**
   * 🆕 GET /admin/shipments/export/csv
   * Export CSV spedizioni per data
   */
  @Get('export/csv')
  @ApiOperation({ summary: 'Export CSV spedizioni per giorno' })
  async exportShipmentsCsv(
    @Query() dto: ShipmentExportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.logger.log(`📊 [API] Export shipments CSV: ${dto.shippingDate}`);

    if (!dto.shippingDate) {
      throw new Error('shippingDate required (YYYY-MM-DD)');
    }

    const csvContent = await this.shipmentExportService.generateShipmentsCSV(
      dto.shippingDate,
    );

    const filename = `spedizioni-${dto.shippingDate}.csv`;

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(csvContent, 'utf-8'),
    });

    return new StreamableFile(Readable.from(csvContent));
  }

  // ===========================
  // 🔍 SHIPMENT DETAIL
  // ===========================

  /**
   * 🆕 GET /admin/shipments/detail/:orderId
   * Dettaglio completo spedizione con tracking e metadati
   */
  @Get('detail/:orderId')
  @ApiOperation({ summary: 'Dettaglio completo spedizione' })
  async getShipmentDetail(
    @Param('orderId') orderId: string,
  ): Promise<ShipmentDetailResponseDto> {
    this.logger.log(`🔍 [API] Get shipment detail: ${orderId}`);

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'items.variant', 'items.variant.product', 'shipment'],
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Calcola metadati
    const totalWeight = order.items?.reduce((sum, item) => {
      const product = item.variant?.product as any;
      const weight = product?.weight || 0.5;
      return sum + weight * item.quantity;
    }, 0) || 0.5;

    const totalParcels = Math.ceil(
      (order.items?.reduce((sum, item) => sum + item.quantity, 0) || 1) / 3,
    );

    const response: ShipmentDetailResponseDto = {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        taxAmount: order.taxAmount,
        createdAt: order.createdAt,
        customerEmail: order.getCustomerEmail() || '',
        notes: order.notes,
      },
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            trackingCode: order.shipment.trackingCode,
            carrier: order.shipment.carrier,
            status: order.shipment.status as string,
            estimatedDeliveryDate: order.shipment.estimatedDeliveryDate,
            labelFilePath: order.shipment.labelFilePath,
            labelDownloaded: order.shipment.labelDownloaded,
            createdAt: order.shipment.createdAt,
            updatedAt: order.shipment.updatedAt,
          }
        : null as any,
      shippingAddress: order.shippingAddress,
      trackingEvents: order.shipment?.trackingEvents || [],
      brtData: {
        shipmentId: order.brtShipmentId,
        trackingNumber: order.brtTrackingNumber,
        tariffCode: order.shipment?.tariffCode,
        labelUrl: order.shipment?.labelFilePath,
        metadata: order.brtShipmentData,
      },
      items: order.items?.map((item) => {
        const product = item.variant?.product as any;
        return {
          productId: item.variantId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          weight: product?.weight,
          dimensions: product?.dimensions,
        };
      }) || [],
      metadata: {
        totalWeight,
        totalParcels,
        canBeModified: order.canBeModified(),
        minutesUntilAutoConfirm: getMinutesUntilAutoConfirm(order.createdAt),
        shippingDate: calculateShippingDate(order.createdAt),
      },
    };

    return response;
  }
}