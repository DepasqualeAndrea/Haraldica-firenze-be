// src/modules/orders/orders.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToClass } from 'class-transformer';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Entities
import { Order, OrderStatus, OrderType } from 'src/database/entities/order.entity';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { User } from 'src/database/entities/user.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';

// Services
import { InventoryService } from 'src/modules/admin-api/inventory/inventory.service';

// DTOs
import {
  CreateOrderFromCartDto,
  OrderFilterDto,
  OrderListResponseDto,
  OrderResponseDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { CartService } from '../cart/cart.service';
import { AddressService } from '../addresses/addresses.service';
import { BrtService } from '../brt/brt.service';
import { ShipmentsService } from '../brt/shipments/shipments.service';

type CartType = 'guest' | 'customer';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    public orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private cartService: CartService,
    private inventoryService: InventoryService,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private addressService: AddressService,
    private configService: ConfigService,
    @Inject(forwardRef(() => BrtService))
    private brtService: BrtService,
    @Inject(forwardRef(() => ShipmentsService))
    private shipmentsService: ShipmentsService,
  ) { }

  async createOrderFromCartWithReservation(
    cartIdentifier: string,
    orderData: CreateOrderFromCartDto,
    manager?: EntityManager,
  ): Promise<Order> {
    const em = manager || this.dataSource.manager;

    return em.transaction(async (transactionManager) => {
      // 1. Recupera cart
      const cartType: CartType =
        orderData.userType ?? (orderData.userId ? 'customer' : 'guest');

      const cart = await this.cartService.getCart(
        cartIdentifier,
        cartType,
        transactionManager,
      );

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Carrello vuoto');
      }

      // 2. Calcola totali - SECURITY: Usa lockedPrice per prevenire manipolazione
      const subtotal = cart.items.reduce((sum, item) => {
        // Usa lockedPrice se disponibile, altrimenti fallback a variant.effectivePrice
        const price = item.lockedPrice
          ? Number(item.lockedPrice)
          : Number(item.variant?.effectivePrice ?? 0);
        return sum + price * item.quantity;
      }, 0);

      // Spedizione gratuita sopra €200 (soglia luxury Haraldica Firenze)
      const shippingConfig = this.configService.get('stripe.shipping');
      const freeShippingThreshold = shippingConfig?.freeShippingThreshold || 200;
      const standardShippingCost = shippingConfig?.standardShippingCost || 9.90;
      const shippingCost = subtotal >= freeShippingThreshold ? 0 : standardShippingCost;
      const total = subtotal + shippingCost;

      // 3. Genera orderNumber
      const orderNumber = await this.generateOrderNumberSafe(transactionManager);

      const order = transactionManager.create(Order, {
        orderNumber,
        orderType:
          orderData.userType === 'guest'
            ? OrderType.GUEST
            : OrderType.CUSTOMER,
        userId: orderData.userId,
        customerEmail: orderData.customerEmail,
        shippingAddress: orderData.shippingAddress,
        billingAddress: orderData.billingAddress || orderData.shippingAddress,
        notes: orderData.notes,
        invoiceRequested: orderData.invoiceRequested,
        subtotal,
        shippingCost,
        total,
        status: OrderStatus.PENDING,
        stockReserved: false,
      });

      const savedOrder = await transactionManager.save(Order, order);

      this.logger.log(
        `📝 Ordine creato: ${savedOrder.orderNumber} (${orderData.userType}, ` +
        `User: ${orderData.userId})`,
      );

      // 5. Crea OrderItems - SECURITY: Usa lockedPrice per prevenire manipolazione
      const orderItems = cart.items.map((cartItem) => {
        // Usa lockedPrice se disponibile, altrimenti fallback a variant.effectivePrice
        const unitPrice = cartItem.lockedPrice
          ? Number(cartItem.lockedPrice)
          : Number(cartItem.variant?.effectivePrice ?? 0);

        return transactionManager.create(OrderItem, {
          order: savedOrder,
          variantId: cartItem.variant?.id,
          productName: cartItem.variant?.product?.name ?? '',
          productSku: cartItem.variant?.sku ?? '',
          quantity: cartItem.quantity,
          unitPrice,
          total: unitPrice * cartItem.quantity,
        });
      });

      await transactionManager.save(OrderItem, orderItems);
      this.logger.log(`📦 Salvati ${orderItems.length} order items`);

      // 6. ✨ Soft reserve stock (2h expiry)
      await Promise.all(
        orderItems.map((orderItem) =>
          this.inventoryService.softReserveStock(
            orderItem.variantId,
            orderItem.quantity,
            savedOrder.id,
            2,
            transactionManager,
          ),
        ),
      );

      savedOrder.stockReserved = true;
      savedOrder.stockReservedAt = new Date();
      await transactionManager.save(Order, savedOrder);

      return savedOrder;
    });
  }

  async confirmOrderPayment(
    orderId: string,
    paymentIntentId: string,
    manager?: EntityManager,
  ): Promise<Order> {
    const execute = async (mgr: EntityManager) => {
      const order = await mgr.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
        relations: ['items', 'items.variant', 'items.variant.product'],
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `⚠️ Tentativo conferma ordine ${order.orderNumber} già in stato ${order.status}`,
        );
        return order;
      }

      await this.inventoryService.confirmReservation(orderId, mgr);

      order.status = OrderStatus.CONFIRMED;
      order.stripePaymentIntentId = paymentIntentId;
      order.stockReserved = false;
      order.stockReservedAt = undefined;
      order.stockReservationExpiresAt = undefined;

      await mgr.save(Order, order);

      this.logger.log(`🎉 Ordine ${order.orderNumber} confermato - stock scalato definitivamente`);

      if (order.shippingAddress && order.userId) {
        try {
          await this.addressService.saveAddressFromCheckout(
            order.shippingAddress,
            order.userId,
            'shipping',
            mgr
          );
          this.logger.log(`📍 Address salvato per ordine ${order.orderNumber}`);
        } catch (error) {
          this.logger.error(`❌ Errore salvataggio address: ${error.message}`);
        }
      }

      try {
        const cartKey = order.userId;
        const cartType: CartType = order.orderType === OrderType.GUEST ? 'guest' : 'customer';

        if (cartKey) {
          await this.cartService.clearCart(cartKey, cartType, mgr);
          this.logger.log(`🛒 Carrello pulito per ordine ${order.orderNumber}`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Errore pulizia cart: ${error.message}`);
      }

      this.eventEmitter.emit('order.confirmed', {
        order,
        user: order.user,
      });

      return order;
    };

    return manager ? execute(manager) : this.dataSource.transaction(execute);
  }

  async updateOrder(
    orderId: string,
    updateData: {
      shippingAddress?: any;
      billingAddress?: any;
      notes?: string;
      trackingNumber?: string;
    },
    userId?: string,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`📝 [UPDATE ORDER] START - Order ID: ${orderId}`);
      const order = await this.findOne(orderId, userId);

      this.logger.log(`   ├─ Order: ${order.orderNumber}`);
      this.logger.log(`   ├─ Status: ${order.status}`);
      this.logger.log(`   ├─ Has BRT: ${order.brtShipmentId ? 'YES' : 'NO'}`);

      if (order.status !== OrderStatus.CONFIRMED) {
        const statusMessages = {
          [OrderStatus.PENDING]: 'in attesa di pagamento',
          [OrderStatus.READY_TO_SHIP]: 'già in preparazione (etichetta generata)',
          [OrderStatus.SHIPPED]: 'già spedito',
          [OrderStatus.DELIVERED]: 'già consegnato',
          [OrderStatus.CANCELLED]: 'annullato',
        };

        const message = statusMessages[order.status] || `in stato ${order.status}`;

        throw new BadRequestException(
          `Ordine ${order.orderNumber} non può essere modificato: ${message}. ` +
          `Contatta il servizio clienti.`,
        );
      }

      if (updateData.shippingAddress) {
        const addr = updateData.shippingAddress;

        if (!addr.name || !addr.street || !addr.city || !addr.postalCode || !addr.country) {
          throw new BadRequestException(
            'Indirizzo di spedizione incompleto. ' +
            'Campi richiesti: name, street, city, postalCode, country'
          );
        }

        this.logger.log(`📍 Aggiornamento indirizzo: ${addr.city}, ${addr.postalCode}`);
      }

      await manager.update(Order, orderId, {
        ...updateData,
        updatedAt: new Date(),
      });

      const updatedOrder = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['items', 'items.variant', 'items.variant.product', 'user'],
      });

      this.logger.log(`✅ Ordine aggiornato: ${order.orderNumber}`);


      const changes: string[] = [];
      if (updateData.shippingAddress) changes.push('indirizzo spedizione');
      if (updateData.billingAddress) changes.push('indirizzo fatturazione');
      if (updateData.notes) changes.push('note');
      if (updateData.trackingNumber) changes.push('tracking number');

      this.logger.log(`   └─ Modifiche: ${changes.join(', ')}`);

      return updatedOrder!;
    });
  }

  async cancelOrder(orderId: string, reason: string, userId?: string): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.findOne(orderId, userId);

      this.logger.log(`❌ [CANCEL ORDER] START - Order: ${order.orderNumber}`);
      this.logger.log(`   ├─ Status: ${order.status}`);
      this.logger.log(`   ├─ Has BRT: ${order.brtShipmentId ? 'YES' : 'NO'}`);
      this.logger.log(`   └─ Reason: ${reason || 'N/A'}`);

      if (!order.isCancellable()) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non può essere cancellato (stato: ${order.status})`,
        );
      }

      // ✅ 1. CANCELLA SPEDIZIONE BRT (se esiste e non ancora ritirata)
      if (order.brtShipmentId && order.status === OrderStatus.READY_TO_SHIP) {
        try {
          this.logger.log(`🗑️ Cancellazione spedizione BRT...`);

          await this.shipmentsService.deleteShipment(orderId, {
            senderCustomerCode: parseInt(process.env.BRT_SENDER_CUSTOMER_CODE || '0'),
            numericSenderReference: this.generateNumericReference(order),
            alphanumericSenderReference: order.orderNumber,
            reason: reason || 'Ordine cancellato dall\'utente',
          });

          this.logger.log(`✅ Spedizione BRT cancellata`);
        } catch (brtError) {
          this.logger.error(`❌ Errore cancellazione BRT: ${brtError.message}`);

          if (brtError.message?.includes('already') || brtError.message?.includes('gestione')) {
            this.logger.warn(
              `⚠️ Spedizione già ritirata da BRT, impossibile cancellare. ` +
              `Ordine verrà comunque cancellato in DB.`
            );
          } else {
            // Per altri errori, potremmo voler bloccare
            throw new BadRequestException(
              `Impossibile cancellare spedizione BRT: ${brtError.message}`
            );
          }
        }
      }

      // ✅ 2. Rilascia stock reservation
      if (order.stockReserved || order.status === OrderStatus.PENDING) {
        await this.inventoryService.releaseReservation(
          orderId,
          reason || 'Ordine cancellato',
          manager,
        );
        this.logger.log(`🔓 Stock reservation rilasciata`);
      }

      // ✅ 3. Aggiorna ordine
      order.status = OrderStatus.CANCELLED;
      order.notes = (order.notes ? order.notes + '\n' : '') +
        `[${new Date().toISOString()}] Cancellato: ${reason}`;
      order.stockReserved = false;

      const updatedOrder = await manager.save(Order, order);

      this.logger.log(`✅ [CANCEL ORDER] SUCCESS - Ordine ${order.orderNumber} cancellato`);

      // ✅ 4. Emit evento
      this.eventEmitter.emit('order.cancelled', {
        order: updatedOrder,
        reason,
      });

      return updatedOrder;
    });
  }

  private generateNumericReference(order: Order): number {
    const timestamp = new Date(order.createdAt).getTime();
    return Math.floor(timestamp / 1000); // Secondi (10 digits)
  }

  async findOne(id: string, userId?: string): Promise<Order> {
    const whereCondition: any = { id };
    if (userId) {
      whereCondition.userId = userId;
    }

    const order = await this.orderRepository.findOne({
      where: whereCondition,
      relations: ['items', 'items.variant', 'items.variant.product', 'user', 'payment'],
    });

    if (!order) {
      throw new NotFoundException(`Ordine ${id} non trovato`);
    }

    if (order.brtTrackingNumber && ['shipped', 'in_transit', 'out_for_delivery'].includes(order.status)) {
      return this.enrichOrderWithTracking(order);
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { orderNumber },
      relations: ['items', 'items.variant', 'items.variant.product', 'user', 'payment'],
    });

    if (!order) {
      throw new NotFoundException(`Ordine ${orderNumber} non trovato`);
    }

    return order;
  }

  async findByPaymentIntentId(
    paymentIntentId: string,
    userId?: string,
  ): Promise<Order | null> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('order.stripePaymentIntentId = :paymentIntentId', { paymentIntentId });

    // ✅ Se userId fornito, filtra per user (sicurezza)
    if (userId) {
      query.andWhere('order.userId = :userId', { userId });
    }

    return query.getOne();
  }

  async findByTrackingToken(trackingToken: string, email: string): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: {
        trackingToken,
        customerEmail: email.toLowerCase(),
      },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });
  }

  async checkTrackingTokenExists(token: string): Promise<boolean> {
    const order = await this.orderRepository.findOne({
      where: { trackingToken: token },
    });
    return !!order;
  }

  async getLastPendingOrder(userId: string): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: {
        userId,
        status: OrderStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
      relations: ['items', 'items.variant', 'items.variant.product', 'user', 'payment'],
    });
  }

  async findUserOrders(
    userId: string,
    filters?: Partial<OrderFilterDto>,
  ): Promise<OrderListResponseDto> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('order.userId = :userId', { userId });

    this.applyFilters(query, filters);

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    query.skip(offset).take(limit);

    const [orders, total] = await query.getManyAndCount();

    return this.buildOrderListResponse(orders, total, page, limit);
  }

  async findOneDetailed(id: string, userId?: string): Promise<OrderResponseDto> {
    const order = await this.findOne(id, userId);
    return plainToClass(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });
  }

  async trackOrderPublic(trackingToken: string, email: string) {
    const order = await this.findByTrackingToken(trackingToken, email);

    if (!order) {
      throw new NotFoundException('Ordine non trovato con questi dati');
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      trackingToken: order.trackingToken,
      shippingAddress: order.shippingAddress,
      estimatedDelivery: order.estimatedDelivery,
      trackingNumber: order.trackingNumber,
      brtTrackingNumber: order.brtTrackingNumber,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.total,
        productName: item.productName,
        productSku: item.productSku,
        variant: item.variant ? {
          id: item.variant.id,
          size: item.size,
          colorName: item.variant.colorName,
          colorHex: item.variant.colorHex,
          image: item.variant.images?.[0],
        } : null,
      })),
    };
  }

  async updateShippingStatus(
    trackingNumber: string,
    status: OrderStatus,
    estimatedDelivery?: Date,
  ): Promise<void> {
    await this.orderRepository.update(
      { trackingNumber },
      {
        status,
        estimatedDelivery,
        updatedAt: new Date(),
      },
    );

    this.logger.log(`📦 Tracking ${trackingNumber} aggiornato → ${status}`);
  }

  async updateOrderStatus(orderId: string, updateDto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.findOne(orderId);

    // 🔒 VALIDAZIONE: Blocco modifiche se ordine non modificabile
    if (!order.canBeModified()) {
      throw new BadRequestException(
        `Ordine ${order.orderNumber} non può essere modificato (stato: ${order.status}). ` +
        `L'etichetta di spedizione è stata creata e l'ordine è in elaborazione.`
      );
    }

    if (!this.canTransitionToStatus(order.status, updateDto.status)) {
      throw new BadRequestException(
        `Impossibile cambiare stato da ${order.status} a ${updateDto.status}`,
      );
    }

    order.status = updateDto.status;
    if (updateDto.trackingNumber) {
      order.trackingNumber = updateDto.trackingNumber;
    }
    if (updateDto.notes) {
      order.notes = updateDto.notes;
    }

    const updatedOrder = await this.orderRepository.save(order);

    this.logger.log(`📦 Ordine ${order.orderNumber} → ${updateDto.status}`);

    // Emit eventi per status specifici
    if (updateDto.status === OrderStatus.SHIPPED) {
      this.eventEmitter.emit('order.shipped', {
        order: updatedOrder,
        user: order.user,
        trackingNumber: updateDto.trackingNumber,
      });
    }

    return updatedOrder;
  }

  async enrichOrderWithTracking(order: Order): Promise<Order & { tracking?: any }> {
    if (!order.brtTrackingNumber) {
      return order;
    }

    try {
      this.logger.log(`📍 Fetching live tracking for order ${order.orderNumber}`);

      const trackingResponse = await this.brtService.getTracking(order.brtTrackingNumber);

      if (!trackingResponse.ttParcelIdResponse?.spedizione) {
        this.logger.warn(`⚠️ No tracking data for ${order.orderNumber}`);
        return order;
      }

      const spedizione = trackingResponse.ttParcelIdResponse.spedizione;

      const tracking = {
        carrier: 'BRT',
        trackingNumber: order.brtTrackingNumber,
        currentStatus: this.extractTrackingStatus(spedizione.eventi),
        lastUpdate: this.parseLastEventDate(spedizione.eventi),
        estimatedDelivery: order.estimatedDelivery, // Dal DB
        deliveredAt: this.extractDeliveryDate(spedizione.eventi),
        events: (spedizione.eventi || []).map(e => ({
          date: e.data,
          time: e.ora,
          description: e.descrizione,
          location: e.localita,
        })),
        consignee: {
          name: spedizione.dati_spedizione?.destinatario,
          city: spedizione.dati_spedizione?.localita,
          postalCode: spedizione.dati_spedizione?.cap,
        },
      };

      this.logger.log(`✅ Tracking enriched for ${order.orderNumber} - Status: ${tracking.currentStatus}`);

      return { ...order, tracking } as any;
    } catch (error) {
      this.logger.warn(`⚠️ Failed to fetch tracking for ${order.orderNumber}: ${error.message}`);
      return order;
    }
  }

  private extractTrackingStatus(eventi?: any[]): string {
    if (!eventi || eventi.length === 0) return 'in_transit';

    const last = eventi[eventi.length - 1];
    const desc = last.descrizione?.toUpperCase() || '';

    if (desc.includes('CONSEGNAT')) return 'delivered';
    if (desc.includes('IN CONSEGNA') || desc.includes('USCITA PER')) return 'out_for_delivery';
    return 'in_transit';
  }


  private parseLastEventDate(eventi?: any[]): Date {
    if (!eventi || eventi.length === 0) return new Date();
    const last = eventi[eventi.length - 1];
    return new Date(`${last.data}T${last.ora || '00:00:00'}`);
  }

  private extractDeliveryDate(eventi?: any[]): Date | undefined {
    if (!eventi || eventi.length === 0) return undefined;

    const deliveryEvent = eventi.find(e =>
      e.descrizione?.toUpperCase().includes('CONSEGNAT')
    );

    if (!deliveryEvent) return undefined;
    return new Date(`${deliveryEvent.data}T${deliveryEvent.ora || '00:00:00'}`);
  }

  private async validateAvailableStock(
    items: Array<{ variantId: string; quantity: number }>,
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
    };

    for (const item of items) {
      try {
        const stockCheck = await this.inventoryService.validateStockAvailability(
          item.variantId,
          item.quantity,
        );

        if (!stockCheck.available) {
          validation.valid = false;
          validation.errors.push(
            `Stock insufficiente per ${stockCheck.itemInfo.name}: ` +
            `richiesto ${item.quantity}, disponibile ${stockCheck.availableStock}`,
          );
        } else if (stockCheck.availableStock <= 5) {
          validation.warnings.push(
            `Stock basso per ${stockCheck.itemInfo.name}: ` +
            `solo ${stockCheck.availableStock} disponibili`,
          );
        }
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Errore validazione ${item.variantId}: ${error.message}`);
      }
    }

    return validation;
  }

  private async generateOrderNumberSafe(manager: EntityManager): Promise<string> {
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `HF${datePrefix}`;

    const row = await manager
      .createQueryBuilder(Order, 'o')
      .select('MAX(o.orderNumber)', 'max')
      .where('o.orderNumber LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: string | null }>();

    const last = row?.max || null;
    const lastSeq = last ? parseInt(last.slice(-3), 10) || 0 : 0;
    const nextSeq = String(lastSeq + 1).padStart(3, '0');

    return `${prefix}${nextSeq}`;
  }


  private canTransitionToStatus(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
      [OrderStatus.READY_TO_SHIP]: [OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED]: [
        OrderStatus.IN_TRANSIT,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
      ],
      [OrderStatus.IN_TRANSIT]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUNDED]: [],
    };

    return allowedTransitions[currentStatus]?.includes(newStatus) || false;
  }

  private applyFilters(query: any, filters?: Partial<OrderFilterDto>): void {
    if (filters?.status) {
      query.andWhere('order.status = :status', { status: filters.status });
    }
    if (filters?.orderNumber) {
      query.andWhere('order.orderNumber LIKE :orderNumber', {
        orderNumber: `%${filters.orderNumber}%`,
      });
    }
    if (filters?.startDate) {
      query.andWhere('order.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters?.endDate) {
      query.andWhere('order.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'DESC';
    query.orderBy(`order.${sortBy}`, sortOrder);
  }

  private buildOrderListResponse(
    orders: Order[],
    total: number,
    page: number,
    limit: number,
  ): OrderListResponseDto {
    const orderDtos = orders.map((order) =>
      plainToClass(OrderResponseDto, order, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      orders: orderDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  private roundToTwo(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async countCompletedOrdersByUserId(userId: string): Promise<number> {
    return this.orderRepository.count({
      where: {
        userId,
        status: In([
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ]),
      },
    });
  }

  // ==================== ADMIN METHODS ====================

  /**
   * Lista tutti gli ordini con filtri (Admin)
   */
  async findAll(filters: OrderFilterDto): Promise<OrderListResponseDto> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.payment', 'payment');

    // Applica filtri
    this.applyFilters(query, filters);

    const [orders, total] = await query.skip(skip).take(limit).getManyAndCount();

    return this.buildOrderListResponse(orders, total, page, limit);
  }

  /**
   * Statistiche generali ordini (Admin)
   */
  async getOrderStats() {
    const stats = await this.orderRepository
      .createQueryBuilder('order')
      .select([
        'COUNT(*) as total_orders',
        'COUNT(CASE WHEN order.status = :pending THEN 1 END) as pending_orders',
        'COUNT(CASE WHEN order.status = :confirmed THEN 1 END) as confirmed_orders',
        'COUNT(CASE WHEN order.status = :processing THEN 1 END) as processing_orders',
        'COUNT(CASE WHEN order.status = :shipped THEN 1 END) as shipped_orders',
        'COUNT(CASE WHEN order.status = :delivered THEN 1 END) as delivered_orders',
        'COUNT(CASE WHEN order.status = :cancelled THEN 1 END) as cancelled_orders',
        'SUM(order.total) as total_revenue',
        'AVG(order.total) as average_order_value',
        'SUM(CASE WHEN order.status != :cancelled THEN order.total ELSE 0 END) as active_revenue',
      ])
      .setParameters({
        pending: OrderStatus.PENDING,
        confirmed: OrderStatus.CONFIRMED,
        processing: OrderStatus.PROCESSING,
        shipped: OrderStatus.SHIPPED,
        delivered: OrderStatus.DELIVERED,
        cancelled: OrderStatus.CANCELLED,
      })
      .getRawOne();

    // Statistiche recenti (ultimi 30 giorni)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentStats = await this.orderRepository
      .createQueryBuilder('order')
      .select([
        'COUNT(*) as recent_orders',
        'SUM(order.total) as recent_revenue',
      ])
      .where('order.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getRawOne();

    return {
      ...stats,
      ...recentStats,
      total_revenue: parseFloat(stats.total_revenue || 0).toFixed(2),
      average_order_value: parseFloat(stats.average_order_value || 0).toFixed(2),
      active_revenue: parseFloat(stats.active_revenue || 0).toFixed(2),
      recent_revenue: parseFloat(recentStats.recent_revenue || 0).toFixed(2),
    };
  }

  /**
   * Ricerca ordini per query testuale (Admin)
   */
  async searchOrders(query: string) {
    const searchTerm = `%${query.toLowerCase()}%`;

    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'searchProduct')
      .where('LOWER(order.orderNumber) LIKE :searchTerm', { searchTerm })
      .orWhere('LOWER(order.customerEmail) LIKE :searchTerm', { searchTerm })
      .orWhere('LOWER(order.trackingNumber) LIKE :searchTerm', { searchTerm })
      .orWhere('LOWER(user.email) LIKE :searchTerm', { searchTerm })
      .orWhere('LOWER(user.firstName) LIKE :searchTerm', { searchTerm })
      .orWhere('LOWER(user.lastName) LIKE :searchTerm', { searchTerm })
      .orderBy('order.createdAt', 'DESC')
      .take(50)
      .getMany();

    return orders;
  }

  /**
   * Analisi revenue per periodo (Admin)
   */
  async getRevenueAnalytics(startDate?: string, endDate?: string) {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .select([
        'DATE(order.createdAt) as date',
        'COUNT(*) as orders_count',
        'SUM(order.total) as revenue',
        'AVG(order.total) as average_order',
      ])
      .where('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .groupBy('DATE(order.createdAt)')
      .orderBy('date', 'DESC');

    if (startDate) {
      query.andWhere('order.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('order.createdAt <= :endDate', { endDate });
    }

    const data = await query.getRawMany();

    return data.map((row) => ({
      date: row.date,
      orders_count: parseInt(row.orders_count),
      revenue: parseFloat(row.revenue).toFixed(2),
      average_order: parseFloat(row.average_order).toFixed(2),
    }));
  }

  /**
   * Distribuzione ordini per stato (Admin)
   */
  async getStatusDistribution() {
    const distribution = await this.orderRepository
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.total)', 'total_value')
      .groupBy('order.status')
      .getRawMany();

    return distribution.map((row) => ({
      status: row.status,
      count: parseInt(row.count),
      total_value: parseFloat(row.total_value || 0).toFixed(2),
    }));
  }


}