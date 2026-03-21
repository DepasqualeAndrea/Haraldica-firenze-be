import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  Logger,
  Post,
  NotFoundException,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';
import { OrdersService } from 'src/modules/public-api/orders/orders.service';
import { OrderFilterDto, UpdateOrderStatusDto } from 'src/modules/public-api/orders/dto/order.dto';
import { OrderStatus } from 'src/database/entities/order.entity';
import { OrderProcessabilityDto } from '../shipments/dto/shipment-admin.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from 'src/database/entities/order.entity';
import { AuditLog, AuditLogInterceptor } from 'src/common/audit';
import { AuditAction } from 'src/database/entities/audit-log.entity';
import {
  calculateShippingDate,
  getMinutesUntilAutoConfirm,
  isOrderBeyondAutoConfirmTime,
} from 'src/utils/shipping-date.util';

@ApiTags('Admin - Orders')
@ApiBearerAuth()
@Controller('admin/orders')
@RequireAdmin()

export class OrdersAdminController {
  private readonly logger = new Logger(OrdersAdminController.name);

  constructor(
    private readonly ordersService: OrdersService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // ==================== LIST & SEARCH ====================

  @Get()
  @ApiOperation({
    summary: 'Lista tutti gli ordini con filtri (Admin)',
    description: 'Lista paginata di tutti gli ordini del sistema con filtri avanzati',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'orderNumber', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'minAmount', required: false, type: Number })
  @ApiQuery({ name: 'maxAmount', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista ordini recuperata con successo' })
  async findAll(@Query() filters: OrderFilterDto) {
    return this.ordersService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Statistiche ordini (Admin)',
    description: 'Statistiche aggregate sugli ordini del sistema',
  })
  @ApiResponse({ status: 200, description: 'Statistiche recuperate' })
  async getOrderStats() {
    return this.ordersService.getOrderStats();
  }

  @Get('search')
  @ApiOperation({
    summary: 'Ricerca ordini (Admin)',
    description: 'Ricerca ordini per numero, email, tracking, etc.',
  })
  @ApiQuery({ name: 'query', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Risultati ricerca' })
  async searchOrders(@Query('query') query: string) {
    return this.ordersService.searchOrders(query);
  }

  @Get('processing')
  @ApiOperation({
    summary: 'Ordini in elaborazione (PROCESSING)',
    description: 'Lista ordini bloccati in stato PROCESSING (da riprocessare manualmente se necessario)',
  })
  @ApiResponse({ status: 200, description: 'Lista ordini in processing' })
  async getProcessingOrders() {
    this.logger.log('📋 [GET] Fetching PROCESSING orders');

    const orders = await this.orderRepository.find({
      where: { status: OrderStatus.PROCESSING },
      relations: ['user', 'shipment', 'items', 'items.variant'],
      order: { createdAt: 'ASC' },
    });

    return {
      success: true,
      count: orders.length,
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        customerEmail: order.customerEmail || order.user?.email,
        customerName: order.shippingAddress?.['name'] || 
          (order.user?.firstName && order.user?.lastName 
            ? `${order.user.firstName} ${order.user.lastName}` 
            : order.user?.firstName || order.user?.lastName || 'N/A'),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        hasShipment: !!order.shipment,
        shipmentId: order.shipment?.id,
        canBeModified: order.canBeModified(),
        itemsCount: order.items?.length || 0,
      })),
    };
  }

  // ==================== DETAIL ====================

  @Get(':id')
  @ApiOperation({
    summary: 'Dettaglio ordine completo (Admin)',
    description: 'Visualizza tutti i dettagli di un ordine inclusi dati sensibili',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Dettagli ordine recuperati' })
  @ApiResponse({ status: 404, description: 'Ordine non trovato' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOneDetailed(id);
  }

  @Get('number/:orderNumber')
  @ApiOperation({
    summary: 'Trova ordine per numero (Admin)',
    description: 'Ricerca ordine tramite numero ordine (es. MRV20260119001)',
  })
  @ApiParam({ name: 'orderNumber', description: 'Numero ordine', example: 'MRV20260119001' })
  @ApiResponse({ status: 200, description: 'Ordine trovato' })
  @ApiResponse({ status: 404, description: 'Ordine non trovato' })
  async findByOrderNumber(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.findByOrderNumber(orderNumber);
  }

  // ==================== STATUS MANAGEMENT ====================

  @Put(':id/status')
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({
    action: AuditAction.ORDER_STATUS_CHANGE,
    entityType: 'order',
    entityIdParam: 'id',
    captureBody: true,
  })
  @ApiOperation({
    summary: 'Aggiorna stato ordine (Admin)',
    description: 'Cambia lo stato di un ordine (pending, confirmed, processing, shipped, delivered, cancelled)',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Stato aggiornato con successo' })
  @ApiResponse({ status: 400, description: 'Stato non valido' })
  @ApiResponse({ status: 404, description: 'Ordine non trovato' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateOrderStatusDto,
  ) {
    this.logger.log(`📝 Admin updating order ${id} status to ${updateDto.status}`);
    return this.ordersService.updateOrderStatus(id, updateDto);
  }

  @Put(':id/confirm')
  @ApiOperation({
    summary: 'Conferma ordine (Admin)',
    description: 'Passa l\'ordine da PENDING a CONFIRMED',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine confermato' })
  async confirmOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.updateOrderStatus(id, {
      status: OrderStatus.CONFIRMED,
      notes: 'Confermato manualmente da admin',
    });
  }

  @Put(':id/process')
  @ApiOperation({
    summary: 'Metti ordine in elaborazione (Admin)',
    description: 'Passa l\'ordine a PROCESSING',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine in elaborazione' })
  async processOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.updateOrderStatus(id, {
      status: OrderStatus.PROCESSING,
      notes: 'In elaborazione da admin',
    });
  }

  @Put(':id/ship')
  @ApiOperation({
    summary: 'Marca ordine come spedito (Admin)',
    description: 'Passa l\'ordine a SHIPPED con tracking number opzionale',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine marcato come spedito' })
  async shipOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: { trackingNumber?: string; notes?: string },
  ) {
    if (data.trackingNumber) {
      await this.ordersService.updateOrder(id, { trackingNumber: data.trackingNumber });
    }
    return this.ordersService.updateOrderStatus(id, {
      status: OrderStatus.SHIPPED,
      notes: data.notes,
    });
  }

  @Put(':id/deliver')
  @ApiOperation({
    summary: 'Marca ordine come consegnato (Admin)',
    description: 'Passa l\'ordine a DELIVERED',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine consegnato' })
  async deliverOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.updateOrderStatus(id, {
      status: OrderStatus.DELIVERED,
      notes: 'Consegnato - confermato da admin',
    });
  }

  @Put(':id/cancel')
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({
    action: AuditAction.ORDER_CANCEL,
    entityType: 'order',
    entityIdParam: 'id',
    captureBody: true,
    description: 'Cancellazione ordine',
  })
  @ApiOperation({
    summary: 'Cancella ordine (Admin)',
    description: 'Cancella un ordine con motivo e gestione stock',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine cancellato' })
  async cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: { reason: string },
  ) {
    this.logger.log(`🚫 Admin cancelling order ${id}: ${data.reason}`);
    return this.ordersService.cancelOrder(id, data.reason);
  }

  // ==================== ORDER MODIFICATIONS ====================

  @Put(':id/shipping')
  @ApiOperation({
    summary: 'Aggiorna indirizzo di spedizione (Admin)',
    description: 'Modifica l\'indirizzo di spedizione di un ordine',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Indirizzo aggiornato' })
  async updateShippingAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    shippingAddress: {
      name: string;
      street: string;
      city: string;
      postalCode: string;
      province?: string;
      country: string;
      phone?: string;
    },
  ) {
    return this.ordersService.updateOrder(id, { shippingAddress });
  }

  @Put(':id/notes')
  @ApiOperation({
    summary: 'Aggiorna note ordine (Admin)',
    description: 'Aggiungi o modifica le note di un ordine',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Note aggiornate' })
  async updateNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: { notes: string },
  ) {
    return this.ordersService.updateOrder(id, { notes: data.notes });
  }

  // ==================== TRACKING ====================

  @Put(':id/tracking')
  @ApiOperation({
    summary: 'Aggiorna tracking number (Admin)',
    description: 'Aggiorna il numero di tracking BRT/corriere',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Tracking aggiornato' })
  async updateTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: { trackingNumber: string },
  ) {
    await this.ordersService.updateOrder(id, { trackingNumber: data.trackingNumber });
    return this.ordersService.updateOrderStatus(id, {
      status: OrderStatus.SHIPPED,
    });
  }

  @Get(':id/tracking-details')
  @ApiOperation({
    summary: 'Dettagli tracking completo (Admin)',
    description: 'Recupera informazioni di tracking da BRT e altri corrieri',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Dettagli tracking recuperati' })
  async getTrackingDetails(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.ordersService.findOne(id);
    return this.ordersService.enrichOrderWithTracking(order);
  }

  // ==================== REPORTS & ANALYTICS ====================

  @Get('analytics/revenue')
  @ApiOperation({
    summary: 'Analisi revenue (Admin)',
    description: 'Analisi delle entrate per periodo',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Analisi revenue' })
  async getRevenueAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ordersService.getRevenueAnalytics(startDate, endDate);
  }

  @Get('analytics/status-distribution')
  @ApiOperation({
    summary: 'Distribuzione stati ordini (Admin)',
    description: 'Conta ordini per stato',
  })
  @ApiResponse({ status: 200, description: 'Distribuzione stati' })
  async getStatusDistribution() {
    return this.ordersService.getStatusDistribution();
  }

  // ==================== BULK OPERATIONS ====================

  @Post('bulk/update-status')
  @ApiOperation({
    summary: 'Aggiorna stato multipli ordini (Admin)',
    description: 'Cambia lo stato di più ordini contemporaneamente',
  })
  @ApiResponse({ status: 200, description: 'Ordini aggiornati' })
  async bulkUpdateStatus(
    @Body() data: { orderIds: string[]; status: OrderStatus; notes?: string },
  ) {
    const results = await Promise.allSettled(
      data.orderIds.map(id =>
        this.ordersService.updateOrderStatus(id, {
          status: data.status,
          notes: data.notes,
        }),
      ),
    );

    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results,
    };
  }

  @Delete('bulk/cancel')
  @UseInterceptors(AuditLogInterceptor)
  @AuditLog({
    action: AuditAction.ORDER_CANCEL,
    entityType: 'order',
    captureBody: true,
    description: 'Cancellazione bulk ordini',
  })
  @ApiOperation({
    summary: 'Cancella multipli ordini (Admin)',
    description: 'Cancella più ordini contemporaneamente',
  })
  @ApiResponse({ status: 200, description: 'Ordini cancellati' })
  async bulkCancelOrders(@Body() data: { orderIds: string[]; reason: string }) {
    const results = await Promise.allSettled(
      data.orderIds.map(id => this.ordersService.cancelOrder(id, data.reason)),
    );

    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results,
    };
  }

  // ==================== PROCESSABILITY CHECK ====================

  /**
   * 🆕 POST /admin/orders/:id/reprocess
   * Riprocessa ordine bloccato in PROCESSING
   */
  @Post(':id/reprocess')
  @ApiOperation({
    summary: 'Riprocessa ordine bloccato',
    description: 'Riporta ordine PROCESSING a CONFIRMED per ricreare spedizione',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Ordine riprocessato' })
  async reprocessOrder(@Param('id', ParseUUIDPipe) id: string) {
    this.logger.log(`🔄 [REPROCESS] Order ${id}`);

    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['shipment'],
    });

    if (!order) {
      throw new NotFoundException('Ordine non trovato');
    }

    if (order.status !== OrderStatus.PROCESSING) {
      throw new NotFoundException(
        `Ordine ${order.orderNumber} non è in stato PROCESSING (attuale: ${order.status})`,
      );
    }

    if (order.shipment) {
      throw new NotFoundException(
        `Ordine ${order.orderNumber} ha già una spedizione - impossibile riprocessare`,
      );
    }

    // Riporta a CONFIRMED
    order.status = OrderStatus.CONFIRMED;
    await this.orderRepository.save(order);

    this.logger.log(`✅ [REPROCESS] ${order.orderNumber} → CONFIRMED`);

    return {
      success: true,
      message: `Ordine ${order.orderNumber} riportato a CONFIRMED`,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
      },
    };
  }

  /**
   * 🆕 GET /admin/orders/:id/can-process
   * Verifica se un ordine può essere processato manualmente
   */
  @Get(':id/can-process')
  @ApiOperation({
    summary: 'Verifica processabilità ordine',
    description: 'Controlla se l\'ordine può essere confermato manualmente (entro 1h)',
  })
  @ApiParam({ name: 'id', description: 'UUID dell\'ordine' })
  @ApiResponse({ status: 200, description: 'Info processabilità', type: OrderProcessabilityDto })
  async canProcessOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderProcessabilityDto> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['shipment'],
    });

    if (!order) {
      throw new NotFoundException('Ordine non trovato');
    }

    const hasShipment = !!order.shipment || !!order.shipmentId;
    const minutesRemaining = getMinutesUntilAutoConfirm(order.createdAt);
    const isBeyondAutoConfirm = isOrderBeyondAutoConfirmTime(order.createdAt);

    let canProcess = false;
    let reason = '';

    if (order.status !== OrderStatus.CONFIRMED) {
      reason = `Ordine non in stato CONFIRMED (attuale: ${order.status})`;
    } else if (hasShipment) {
      reason = 'Spedizione già creata per questo ordine';
    } else if (isBeyondAutoConfirm) {
      reason = 'Oltre 1h dalla creazione - in attesa auto-conferma o già processato';
    } else {
      canProcess = true;
      reason = `Processabile manualmente - ${minutesRemaining} minuti rimanenti`;
    }

    return {
      canProcess,
      reason,
      minutesRemaining,
      hasShipment,
      currentStatus: order.status,
      createdAt: order.createdAt,
      expectedShippingDate: calculateShippingDate(order.createdAt),
    };
  }
}