import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, In } from 'typeorm';
import { InspectionResultDto, ProcessRefundDto } from './dto/inspection-result.dto';
import { ReturnFilterDto, ReturnStatsFilterDto } from './dto/return-filter.dto';
import { ReturnStatus, FINAL_STATUSES, CANCELLABLE_STATUSES } from './enums/return-status.enum';
import { ReturnReason, REQUIRES_SEALED_PRODUCT, REFUNDS_RETURN_SHIPPING } from './enums/return-reason.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeService } from '../payments/stripe.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';
import { ReturnItem, InspectionStatus } from 'src/database/entities/return-item.entity';
import { Return } from 'src/database/entities/return.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto, RequestAdditionalInfoDto, CancelReturnDto } from './dto/update-return-status.dto';
import { AuditLogService } from 'src/common/audit';
import { AuditAction } from 'src/database/entities/audit-log.entity';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectRepository(Return)
    private returnRepository: Repository<Return>,

    @InjectRepository(ReturnItem)
    private returnItemRepository: Repository<ReturnItem>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,

    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,

    private notificationsService: NotificationsService,
    private stripeService: StripeService,
    private eventEmitter: EventEmitter2,
    private auditLogService: AuditLogService,
  ) {}

  // ===========================
  // UTILITIES
  // ===========================

  private generateReturnNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `RMA-${year}-${random}${timestamp}`;
  }

  private async validateReturnRequest(dto: CreateReturnDto, userId: string): Promise<Order> {
    // 1. Verifica ordine esiste e appartiene all'utente
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId, userId },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Ordine non trovato');
    }

    // 2. Verifica ordine è completato e consegnato
    if (!['delivered', 'completed'].includes(order.status)) {
      throw new BadRequestException('Puoi richiedere un reso solo per ordini consegnati');
    }

    // 3. Verifica finestra temporale reso (14 giorni)
    const daysSinceDelivery = Math.floor(
      (new Date().getTime() - new Date(order.deliveredAt || order.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (daysSinceDelivery > 14) {
      throw new BadRequestException(
        'La finestra per richiedere un reso è scaduta (14 giorni dalla consegna)'
      );
    }

    // 4. Verifica items appartengono all'ordine
    const orderItemIds = order.items.map(i => i.id);
    const requestedItemIds = dto.items.map(i => i.orderItemId);
    const invalidItems = requestedItemIds.filter(id => !orderItemIds.includes(id));

    if (invalidItems.length > 0) {
      throw new BadRequestException('Alcuni prodotti non appartengono a questo ordine');
    }

    // 5. Verifica non ci siano già resi attivi per questi items
    const existingReturns = await this.returnRepository.find({
      where: { orderId: dto.orderId },
      relations: ['items'],
    });

    const activeReturns = existingReturns.filter(r => !FINAL_STATUSES.includes(r.status));

    if (activeReturns.length > 0) {
      const returnedItemIds = activeReturns.flatMap(r => r.items.map(i => i.orderItemId));
      const duplicate = requestedItemIds.some(id => returnedItemIds.includes(id));

      if (duplicate) {
        throw new BadRequestException(
          'Hai già una richiesta di reso attiva per alcuni di questi prodotti'
        );
      }
    }

    return order;
  }

  private addTimelineEvent(
    returnEntity: Return,
    status: ReturnStatus,
    performedBy?: string,
    notes?: string
  ): void {
    if (!returnEntity.timeline) {
      returnEntity.timeline = [];
    }

    returnEntity.timeline.push({
      status,
      timestamp: new Date(),
      performedBy,
      notes,
    });
  }

  private calculateRefundAmount(returnEntity: Return): number {
    return returnEntity.items
      .filter(item => item.inspectionStatus === InspectionStatus.APPROVED)
      .reduce((sum, item) => sum + item.refundAmount, 0);
  }

  private shouldRefundShipping(returnEntity: Return): boolean {
    return REFUNDS_RETURN_SHIPPING.includes(returnEntity.reason);
  }

  // ===========================
  // CREATE RETURN
  // ===========================

  async createReturn(dto: CreateReturnDto, userId: string): Promise<Return> {
    this.logger.log(`Creating return for order ${dto.orderId} by user ${userId}`);

    const order = await this.validateReturnRequest(dto, userId);
    const customerEmail = dto.customerEmail ?? order.customerEmail ?? undefined;

    const returnEntity = this.returnRepository.create({
      returnNumber: this.generateReturnNumber(),
      orderId: dto.orderId,
      userId,
      reason: dto.reason,
      status: ReturnStatus.REQUESTED,
      customerNotes: dto.customerNotes,
      customerPhotos: dto.customerPhotos || [],
      customerEmail,
      totalValue: 0,
      timeline: [],
    });

    this.addTimelineEvent(returnEntity, ReturnStatus.REQUESTED, userId, 'Richiesta reso creata');

    let totalValue = 0;

    for (const itemDto of dto.items) {
      const orderItem = order.items.find(i => i.id === itemDto.orderItemId);
      if (!orderItem) continue;

      const returnItem = this.returnItemRepository.create({
        orderItemId: itemDto.orderItemId,
        variantId: itemDto.variantId ?? orderItem.variantId,
        productName: orderItem.productName,
        productSku: orderItem.productSku,
        unitPrice: orderItem.unitPrice,
        quantity: itemDto.quantity,
        inspectionStatus: InspectionStatus.PENDING,
        refundAmount: orderItem.unitPrice * itemDto.quantity,
      });

      totalValue += returnItem.refundAmount;

      if (!returnEntity.items) returnEntity.items = [];
      returnEntity.items.push(returnItem);
    }

    returnEntity.totalValue = totalValue;

    const saved = (await this.returnRepository.save(returnEntity)) as Return;

    await this.sendReturnNotification(saved, 'REQUESTED');
    this.eventEmitter.emit('return.created', saved);

    this.logger.log(`Return ${saved.returnNumber} created successfully`);
    return saved;
  }

  async getMyReturns(userId: string, filter?: ReturnFilterDto): Promise<{ returns: Return[]; total: number }> {
    const where: FindOptionsWhere<Return> = { userId };

    if (filter?.status) where.status = filter.status;
    if (filter?.reason) where.reason = filter.reason;
    if (filter?.returnNumber) where.returnNumber = filter.returnNumber;

    if (filter?.startDate || filter?.endDate) {
      where.createdAt = Between(
        filter.startDate ? new Date(filter.startDate) : new Date(0),
        filter.endDate ? new Date(filter.endDate) : new Date()
      );
    }

    const [returns, total] = await this.returnRepository.findAndCount({
      where,
      relations: ['order', 'items', 'items.variant'],
      order: { [filter?.sortBy || 'createdAt']: filter?.sortOrder || 'DESC' },
      skip: ((filter?.page || 1) - 1) * (filter?.limit || 20),
      take: filter?.limit || 20,
    });

    return { returns, total };
  }

  async getReturnById(id: string, userId: string): Promise<Return> {
    const returnEntity = await this.returnRepository.findOne({
      where: { id, userId },
      relations: ['order', 'items', 'items.variant', 'items.orderItem'],
    });

    if (!returnEntity) {
      throw new NotFoundException('Reso non trovato');
    }

    return returnEntity;
  }

  async getAllReturns(filter?: ReturnFilterDto): Promise<{ returns: Return[]; total: number }> {
    const where: FindOptionsWhere<Return> = {};

    if (filter?.status) where.status = filter.status;
    if (filter?.reason) where.reason = filter.reason;
    if (filter?.userId) where.userId = filter.userId;
    if (filter?.returnNumber) where.returnNumber = filter.returnNumber;

    if (filter?.startDate || filter?.endDate) {
      where.createdAt = Between(
        filter.startDate ? new Date(filter.startDate) : new Date(0),
        filter.endDate ? new Date(filter.endDate) : new Date()
      );
    }

    if (filter?.requiresAction) {
      where.status = In([ReturnStatus.REQUESTED, ReturnStatus.RECEIVED, ReturnStatus.INSPECTING]);
    }

    if (filter?.pendingRefund) {
      where.status = In([ReturnStatus.APPROVED, ReturnStatus.PARTIALLY_APPROVED]);
    }

    const [returns, total] = await this.returnRepository.findAndCount({
      where,
      relations: ['order', 'user', 'items', 'items.variant'],
      order: { [filter?.sortBy || 'createdAt']: filter?.sortOrder || 'DESC' },
      skip: ((filter?.page || 1) - 1) * (filter?.limit || 20),
      take: filter?.limit || 20,
    });

    return { returns, total };
  }

  async getReturnByIdAdmin(id: string): Promise<Return> {
    const returnEntity = await this.returnRepository.findOne({
      where: { id },
      relations: ['order', 'user', 'items', 'items.variant', 'items.orderItem'],
    });

    if (!returnEntity) {
      throw new NotFoundException('Reso non trovato');
    }

    return returnEntity;
  }

  private async sendReturnNotification(returnEntity: Return, type: string): Promise<void> {
    try {
      this.logger.log(`Sending ${type} notification for return ${returnEntity.returnNumber}`);

      // Mappa il tipo al metodo corretto di sendReturnEmail
      const typeMap: Record<string, 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REFUNDED'> = {
        'REQUESTED': 'REQUESTED',
        'PENDING_REVIEW': 'REQUESTED',
        'APPROVED': 'APPROVED',
        'AWAITING_RETURN': 'APPROVED',
        'RECEIVED': 'APPROVED',
        'INSPECTING': 'APPROVED',
        'REJECTED': 'REJECTED',
        'REFUNDED': 'REFUNDED',
        'PARTIALLY_REFUNDED': 'REFUNDED',
      };

      const emailType = typeMap[type];

      if (emailType) {
        await this.notificationsService.sendReturnEmail(returnEntity, emailType);
      } else {
        this.logger.warn(`No email template for return type: ${type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send return notification: ${error.message}`);
    }
  }

  // ===========================
  // ADMIN WORKFLOW ACTIONS
  // ===========================

  async updateReturnStatus(
    id: string,
    dto: UpdateReturnStatusDto,
    adminId: string
  ): Promise<Return> {
    const returnEntity = await this.getReturnByIdAdmin(id);

    if (returnEntity.isFinal) {
      throw new BadRequestException('Non puoi modificare un reso già concluso');
    }

    const oldStatus = returnEntity.status;
    returnEntity.status = dto.status;

    if (dto.adminNotes) {
      returnEntity.adminNotes = dto.adminNotes;
    }

    if (dto.rejectionReason) {
      returnEntity.rejectionReason = dto.rejectionReason;
    }

    if (dto.returnTrackingNumber) {
      returnEntity.returnTrackingNumber = dto.returnTrackingNumber;
    }

    if (dto.adminPhotos) {
      returnEntity.adminPhotos = [...(returnEntity.adminPhotos || []), ...dto.adminPhotos];
    }

    // Aggiungi evento timeline
    this.addTimelineEvent(
      returnEntity,
      dto.status,
      adminId,
      dto.adminNotes || `Stato cambiato da ${oldStatus} a ${dto.status}`
    );

    // Logica specifica per stato
    switch (dto.status) {
      case ReturnStatus.APPROVED_FOR_RETURN:
        returnEntity.returnTrackingNumber = dto.returnTrackingNumber || this.generateReturnNumber();
        break;

      case ReturnStatus.RECEIVED:
        returnEntity.receivedAt = new Date();
        break;

      case ReturnStatus.INSPECTING:
        if (!returnEntity.inspectedBy) {
          returnEntity.inspectedBy = adminId;
          returnEntity.inspectedAt = new Date();
        }
        break;
    }

    const saved = (await this.returnRepository.save(returnEntity)) as Return;

    // Invia email se richiesto
    if (dto.sendEmail !== false) {
      await this.sendReturnNotification(saved, dto.status);
    }

    this.eventEmitter.emit('return.status_updated', { returnEntity: saved, oldStatus });

    this.logger.log(`Return ${saved.returnNumber} status updated to ${dto.status}`);
    return saved;
  }

  async requestAdditionalInfo(
    id: string,
    dto: RequestAdditionalInfoDto,
    adminId: string
  ): Promise<Return> {
    const returnEntity = await this.getReturnByIdAdmin(id);

    if (returnEntity.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException('Puoi richiedere info aggiuntive solo per resi in stato REQUESTED');
    }

    returnEntity.status = ReturnStatus.PENDING_INFO;
    returnEntity.requiresAdditionalInfo = true;
    returnEntity.additionalInfoRequest = dto.infoRequest;

    this.addTimelineEvent(
      returnEntity,
      ReturnStatus.PENDING_INFO,
      adminId,
      `Info richieste: ${dto.infoRequest}`
    );

    const saved = (await this.returnRepository.save(returnEntity)) as Return;

    await this.sendReturnNotification(saved, 'PENDING_INFO');

    return saved;
  }

  async cancelReturn(
    id: string,
    dto: CancelReturnDto,
    userId: string,
    isAdmin: boolean = false
  ): Promise<Return> {
    const returnEntity = isAdmin
      ? await this.getReturnByIdAdmin(id)
      : await this.getReturnById(id, userId);

    if (!returnEntity.isCancellable) {
      throw new BadRequestException('Questo reso non può più essere annullato');
    }

    returnEntity.status = ReturnStatus.CANCELLED;

    this.addTimelineEvent(
      returnEntity,
      ReturnStatus.CANCELLED,
      userId,
      dto.reason || 'Reso annullato'
    );

    const saved = (await this.returnRepository.save(returnEntity)) as Return;

    await this.sendReturnNotification(saved, 'CANCELLED');

    return saved;
  }

  // ===========================
  // INSPECTION & REFUND
  // ===========================

  async submitInspection(
    id: string,
    dto: InspectionResultDto,
    adminId: string
  ): Promise<Return> {
    const returnEntity = await this.getReturnByIdAdmin(id);

    if (returnEntity.status !== ReturnStatus.INSPECTING && returnEntity.status !== ReturnStatus.RECEIVED) {
      throw new BadRequestException('Ispezione disponibile solo per resi in stato RECEIVED o INSPECTING');
    }

    for (const itemDto of dto.items) {
      const returnItem = returnEntity.items.find(i => i.id === itemDto.returnItemId);
      if (!returnItem) continue;

      returnItem.inspectionStatus = itemDto.inspectionStatus;
      returnItem.productConforms = itemDto.productConforms;
      returnItem.inspectionNotes = itemDto.inspectionNotes ?? '';
      returnItem.inspectionPhotos = itemDto.inspectionPhotos || [];

      if (itemDto.refundAmount !== undefined) {
        returnItem.refundAmount = itemDto.refundAmount;
      }

      await this.returnItemRepository.save(returnItem);
    }

    const approvedItems = returnEntity.items.filter(i => i.inspectionStatus === InspectionStatus.APPROVED);
    const rejectedItems = returnEntity.items.filter(i => i.inspectionStatus === InspectionStatus.REJECTED);

    let newStatus: ReturnStatus;

    if (approvedItems.length === returnEntity.items.length) {
      newStatus = ReturnStatus.APPROVED;
    } else if (rejectedItems.length === returnEntity.items.length) {
      newStatus = ReturnStatus.REJECTED;
    } else {
      newStatus = ReturnStatus.PARTIALLY_APPROVED;
    }

    returnEntity.status = newStatus;
    returnEntity.inspectedBy = adminId;
    returnEntity.inspectedAt = new Date();

    if (dto.generalNotes) {
      returnEntity.adminNotes = dto.generalNotes;
    }

    returnEntity.refundAmount = this.calculateRefundAmount(returnEntity);

    this.addTimelineEvent(
      returnEntity,
      newStatus,
      adminId,
      `Ispezione completata: ${approvedItems.length}/${returnEntity.items.length} prodotti approvati`
    );

    const saved = (await this.returnRepository.save(returnEntity)) as Return;

    const shouldReintegrate = dto.reintegrateStock !== false && approvedItems.length > 0;

    if (shouldReintegrate) {
      await this.reintegrateStock(saved);
    }

    await this.sendReturnNotification(saved, newStatus);
    this.eventEmitter.emit('return.inspected', saved);

    return saved;
  }

  async processRefund(id: string, dto: ProcessRefundDto, adminId: string): Promise<Return> {
    const returnEntity = await this.getReturnByIdAdmin(id);

    if (!returnEntity.isRefundable) {
      throw new BadRequestException('Questo reso non è rimborsabile');
    }

    if (returnEntity.refundedAt) {
      throw new BadRequestException('Rimborso già effettuato');
    }

    const order = await this.orderRepository.findOne({
      where: { id: returnEntity.orderId },
    });

    if (!order || !order.stripePaymentIntentId) {
      throw new BadRequestException('Ordine o PaymentIntent non trovato');
    }

    let refundAmount = returnEntity.refundAmount;

    if (dto.includeShippingCost || this.shouldRefundShipping(returnEntity)) {
      refundAmount += order.shippingCost;
    }

    try {
      const refund = await this.stripeService.createRefund({
        paymentIntentId: order.stripePaymentIntentId,
        amount: refundAmount,
        options: {
          reason: 'requested_by_customer',
          metadata: {
            returnId: returnEntity.id,
            returnNumber: returnEntity.returnNumber,
            orderId: order.id,
          },
        },
      });

      returnEntity.stripeRefundId = refund.id;
      returnEntity.refundedAt = new Date();
      returnEntity.status =
        returnEntity.status === ReturnStatus.PARTIALLY_APPROVED
          ? ReturnStatus.PARTIALLY_REFUNDED
          : ReturnStatus.REFUNDED;

      this.addTimelineEvent(
        returnEntity,
        returnEntity.status,
        adminId,
        `Rimborso di €${refundAmount.toFixed(2)} effettuato tramite Stripe`
      );

      const saved = (await this.returnRepository.save(returnEntity)) as Return;

      await this.sendReturnNotification(saved, 'REFUNDED');
      this.eventEmitter.emit('return.refunded', saved);

      this.logger.log(`Refund processed for return ${saved.returnNumber}: €${refundAmount}`);

      // SECURITY: Audit log per rimborsi
      await this.auditLogService.log({
        adminId,
        action: AuditAction.ORDER_REFUND,
        entityType: 'return',
        entityId: saved.id,
        description: `Rimborso €${refundAmount.toFixed(2)} processato per reso ${saved.returnNumber}`,
        newData: {
          returnNumber: saved.returnNumber,
          orderId: order.id,
          orderNumber: order.orderNumber,
          refundAmount,
          stripeRefundId: refund.id,
        },
      });

      return saved;

    } catch (error) {
      this.logger.error(`Refund failed for return ${returnEntity.returnNumber}:`, error);
      throw new BadRequestException(`Errore durante il rimborso: ${error.message}`);
    }
  }

  private async reintegrateStock(returnEntity: Return): Promise<void> {
    const approvedItems = returnEntity.items.filter(
      i => i.inspectionStatus === InspectionStatus.APPROVED && !i.stockReintegrated
    );

    for (const item of approvedItems) {
      const variant = await this.variantRepository.findOne({
        where: { id: item.variantId },
      });

      if (!variant) continue;

      await this.variantRepository.update(item.variantId, {
        stock: variant.stock + item.quantity,
      });

      item.stockReintegrated = true;
      await this.returnItemRepository.save(item);

      this.logger.log(`Stock reintegrated for variant ${item.productSku ?? item.variantId}: +${item.quantity}`);
    }

    returnEntity.stockReintegrated = true;
    await this.returnRepository.save(returnEntity);
  }
}