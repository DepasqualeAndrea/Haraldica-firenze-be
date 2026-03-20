// import {
//   Injectable,
//   BadRequestException,
//   NotFoundException,
//   Logger
// } from "@nestjs/common";
// import { InjectRepository } from "@nestjs/typeorm";
// import { plainToClass } from "class-transformer";
// import { Repository, DataSource, EntityManager, In } from "typeorm";
// import { EventEmitter2 } from "@nestjs/event-emitter";

// // Entities
// import { Order, OrderStatus, OrderType } from "src/database/entities/order.entity";
// import { OrderItem } from "src/database/entities/order-item.entity";
// import { User } from "src/database/entities/user.entity";
// import { Product } from "src/database/entities/product.entity";

// import { InventoryService } from "../inventory/inventory.service";

// // DTOs
// import {
//   CreateOrderFromCartDto,
//   OrderFilterDto,
//   OrderListResponseDto,
//   OrderResponseDto,
//   UpdateOrderStatusDto
// } from "./dto/order.dto";
// import { CartService } from "src/modules/public-api/cart/cart.service";
// import { ProductsPublicService } from "src/modules/public-api/products/products-public.service";

// type CartType = 'guest' | 'registered';

// @Injectable()
// export class OrdersService {
//   private readonly logger = new Logger(OrdersService.name);

//   constructor(
//     @InjectRepository(Order)
//     public orderRepository: Repository<Order>,
//     @InjectRepository(OrderItem)
//     private orderItemRepository: Repository<OrderItem>,
//     @InjectRepository(User)
//     private userRepository: Repository<User>,
//     private productsService: ProductsPublicService,
//     private cartService: CartService,
//     private inventoryService: InventoryService,
//     private dataSource: DataSource,
//     private eventEmitter: EventEmitter2,
//   ) { }

//   // ===========================
//   // 🛒 ORDER CREATION FROM CART (WITH RESERVATIONS)
//   // ===========================

//   /**
//    * Crea ordine da carrello CON soft reserve stock
//    * - Valida stock disponibile
//    * - Crea ordine PENDING
//    * - Riserva stock (soft reserve)
//    * - NON pulisce il cart (lo farà il webhook dopo pagamento)
//    * 
//    * Questo è il metodo principale per checkout
//    */
//   async createOrderFromCartWithReservation(
//     cartKey: string,
//     orderData: CreateOrderFromCartDto,
//     manager?: EntityManager
//   ): Promise<Order> {
//     const execute = async (mgr: EntityManager) => {
//       const userType: CartType = (orderData.userType as CartType) || 'registered';
//       const isGuest = userType === 'guest';

//       // 1. Valida carrello
//       const cartDto = await this.cartService.getCartWithTotals(cartKey, userType);
//       if (!cartDto || cartDto.items.length === 0) {
//         throw new BadRequestException('Carrello vuoto o non trovato');
//       }

//       const validation = await this.cartService.validateCartForCheckout(cartKey, userType);
//       if (!validation.valid) {
//         throw new BadRequestException(`Carrello non valido: ${validation.errors.join(', ')}`);
//       }

//       // 2. Valida stock disponibile (availableStock, considerando reserved)
//       const stockValidation = await this.validateAvailableStock(cartDto.items);
//       if (!stockValidation.valid) {
//         throw new BadRequestException(
//           `Stock non disponibile: ${stockValidation.errors.join(', ')}`
//         );
//       }

//       // 3. Calcola totali
//       let subtotal = 0;
//       const itemsData: Array<{
//         product: Product;
//         quantity: number;
//         unitPrice: number;
//       }> = [];

//       for (const cartItem of cartDto.items) {
//         const product = await this.productsService.findPurchasableItem(cartItem.productId);

//         if (!product.isActive) {
//           throw new BadRequestException(`Prodotto ${product.name} non più disponibile`);
//         }

//         const unitPrice = product.price;
//         subtotal += unitPrice * cartItem.quantity;

//         itemsData.push({
//           product,
//           quantity: cartItem.quantity,
//           unitPrice
//         });
//       }

//       const shippingCost = 0; // TODO: calcolo spedizione
//       const discountAmount = 0; // TODO: coupon
//       const total = subtotal + shippingCost - discountAmount;

//       // 4. Crea ordine PENDING
//       const orderNumber = await this.generateOrderNumberSafe(mgr);

//       const order = mgr.create(Order, {
//         orderNumber,
//         userId: orderData.userId,
//         customerEmail: orderData.customerEmail,
//         orderType: isGuest ? OrderType.GUEST : OrderType.CUSTOMER,
//         status: OrderStatus.PENDING,
//         subtotal: this.roundToTwo(subtotal),
//         shippingCost: this.roundToTwo(shippingCost),
//         discountAmount: this.roundToTwo(discountAmount),
//         total: this.roundToTwo(total),
//         shippingAddress: orderData.shippingAddress,
//         billingAddress: orderData.billingAddress || orderData.shippingAddress,
//         notes: orderData.notes,
//         couponCode: orderData.couponCode,
//         stockReserved: false,
//       });

//       const savedOrder = await mgr.save(Order, order);

//       this.logger.log(
//         `📝 Ordine creato: ${savedOrder.orderNumber} ` +
//         `(${savedOrder.orderType}, User: ${savedOrder.userId})`
//       );

//       // 5. Crea OrderItems
//       const orderItems = itemsData.map(({ product, quantity, unitPrice }) =>
//         mgr.create(OrderItem, {
//           orderId: savedOrder.id,
//           productId: product.id,
//           productName: product.name,
//           productSku: product.sku,
//           unitPrice: this.roundToTwo(unitPrice),
//           quantity,
//           total: this.roundToTwo(unitPrice * quantity),
//         })
//       );

//       await mgr.save(OrderItem, orderItems);

//       this.logger.log(`📦 Salvati ${orderItems.length} order items`);

//       // 6. ✨ SOFT RESERVE STOCK (NON scala stock fisico)
//       for (const { product, quantity } of itemsData) {
//         await this.inventoryService.softReserveStock(
//           product.id,
//           quantity,
//           savedOrder.id,
//           2, // 2 ore di scadenza
//           mgr
//         );
//       }

//       // 7. Aggiorna ordine: stockReserved = true
//       const expiresAt = new Date();
//       expiresAt.setHours(expiresAt.getHours() + 2);

//       savedOrder.stockReserved = true;
//       savedOrder.stockReservedAt = new Date();
//       savedOrder.stockReservationExpiresAt = expiresAt;

//       await mgr.save(Order, savedOrder);

//       this.logger.log(
//         `✅ Stock riservato per ordine ${savedOrder.orderNumber} ` +
//         `(scadenza: ${expiresAt.toLocaleString('it-IT')})`
//       );

//       // 8. Carica ordine completo
//       return mgr.findOneOrFail(Order, {
//         where: { id: savedOrder.id },
//         relations: ['items', 'items.product', 'user']
//       });
//     };

//     return manager ? execute(manager) : this.dataSource.transaction(execute);
//   }

//   /**
//    * Conferma pagamento ordine
//    * - Conferma reservations → scala stock definitivo
//    * - Cambia status: PENDING → CONFIRMED
//    * - Crea Payment record (fatto dal webhook service)
//    * - Clear cart
//    * 
//    * Chiamato dal webhook dopo pagamento Stripe confermato
//    */
//   async confirmOrderPayment(
//     orderId: string,
//     paymentIntentId: string,
//     manager?: EntityManager
//   ): Promise<Order> {
//     const execute = async (mgr: EntityManager) => {
//       // 1. Carica ordine con lock
//       const order = await mgr.findOne(Order, {
//         where: { id: orderId },
//         lock: { mode: 'pessimistic_write' },
//         relations: ['items', 'items.product']
//       });

//       if (!order) {
//         throw new NotFoundException(`Ordine ${orderId} non trovato`);
//       }

//       // 2. Verifica stato
//       if (order.status !== OrderStatus.PENDING) {
//         this.logger.warn(
//           `⚠️ Tentativo conferma ordine ${order.orderNumber} già in stato ${order.status}`
//         );
//         return order;
//       }

//       // 3. ✨ CONFERMA RESERVATIONS → scala stock fisico
//       await this.inventoryService.confirmReservation(orderId, mgr);

//       // 4. Aggiorna ordine
//       order.status = OrderStatus.CONFIRMED;
//       order.stripePaymentIntentId = paymentIntentId;
//       order.stockReserved = false; // Non più riservato, ora scalato
//       order.stockReservedAt = undefined;
//       order.stockReservationExpiresAt = undefined;

//       await mgr.save(Order, order);

//       this.logger.log(
//         `🎉 Ordine ${order.orderNumber} confermato - stock scalato definitivamente`
//       );

//       // 5. Clear cart (se esiste)
//       try {
//         const cartKey = order.userId
//         const cartType: CartType = order.orderType === OrderType.GUEST ? 'guest' : 'registered';

//         if (cartKey) {
//           await this.cartService.clearCart(cartKey, cartType, mgr);
//           this.logger.log(`🛒 Carrello pulito per ordine ${order.orderNumber}`);
//         }
//       } catch (error) {
//         this.logger.warn(`⚠️ Errore pulizia cart: ${error.message}`);
//       }

//       // 6. Emit evento per email
//       this.eventEmitter.emit('order.confirmed', {
//         orderId: order.id,
//         orderNumber: order.orderNumber,
//         customerEmail: order.customerEmail,
//         total: order.total,
//       });

//       return order;
//     };

//     return manager ? execute(manager) : this.dataSource.transaction(execute);
//   }

//   /**
//    * Cancella ordine e rilascia stock reservation
//    * - Rilascia stock riservato
//    * - Cambia status → CANCELLED
//    * 
//    * Usato per cancellazioni manuali o automatiche (expired)
//    */
//   async cancelOrder(
//     orderId: string,
//     reason: string,
//     userId?: string
//   ): Promise<Order> {
//     return this.dataSource.transaction(async (manager) => {
//       const order = await this.findOne(orderId, userId);

//       if (!order.isCancellable()) {
//         throw new BadRequestException(
//           `Ordine ${order.orderNumber} non può essere cancellato (stato: ${order.status})`
//         );
//       }

//       // ✨ RILASCIA RESERVATIONS (se ancora riservato)
//       if (order.stockReserved || order.status === OrderStatus.PENDING) {
//         await this.inventoryService.releaseReservation(
//           orderId,
//           reason || 'Ordine cancellato',
//           manager
//         );
//       }

//       // Se già confermato, ripristina stock con movimento RETURN
//       if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.PROCESSING) {
//         for (const item of order.items) {
//           await this.inventoryService.recordReturnMovement(
//             item.productId,
//             item.quantity,
//             order.id,
//             userId
//           );
//         }
//       }

//       order.status = OrderStatus.CANCELLED;
//       order.notes = (order.notes ? order.notes + '\n' : '') + `Cancellato: ${reason}`;
//       order.stockReserved = false;

//       const updatedOrder = await manager.save(Order, order);

//       this.logger.log(
//         `❌ Ordine ${order.orderNumber} cancellato - stock rilasciato/ripristinato`
//       );

//       return updatedOrder;
//     });
//   }

//   /**
//    * Aggiorna indirizzo spedizione su ordine PENDING
//    * - Verifica che ordine sia ancora PENDING
//    * - Verifica che stock reservation sia ancora valida
//    */
//   async updateOrderShipping(
//     orderId: string,
//     shippingData: {
//       shippingAddress: any;
//       billingAddress?: any;
//       customerEmail?: string;
//       phone?: string;
//     }
//   ): Promise<Order> {
//     return this.dataSource.transaction(async (manager) => {
//       const order = await manager.findOne(Order, {
//         where: { id: orderId },
//         lock: { mode: 'pessimistic_write' }
//       });

//       if (!order) {
//         throw new NotFoundException(`Ordine ${orderId} non trovato`);
//       }

//       if (order.status !== OrderStatus.PENDING) {
//         throw new BadRequestException(
//           `Impossibile aggiornare indirizzo: ordine in stato ${order.status}`
//         );
//       }

//       // Verifica che reservation non sia scaduta
//       if (order.stockReservationExpiresAt && order.stockReservationExpiresAt < new Date()) {
//         throw new BadRequestException(
//           'Reservation stock scaduta. Riprova il checkout.'
//         );
//       }

//       order.shippingAddress = shippingData.shippingAddress;
//       if (shippingData.billingAddress) {
//         order.billingAddress = shippingData.billingAddress;
//       }
//       if (shippingData.customerEmail) {
//         order.customerEmail = shippingData.customerEmail;
//       }

//       const updatedOrder = await manager.save(Order, order);

//       this.logger.log(`📝 Indirizzo aggiornato per ordine ${order.orderNumber}`);

//       return updatedOrder;
//     });
//   }

//   // ===========================
//   // 📊 QUERY & RETRIEVAL
//   // ===========================

//   /**
//    * Trova ordine per ID
//    */
//   async findOne(id: string, userId?: string): Promise<Order> {
//     const whereCondition: any = { id };
//     if (userId) {
//       whereCondition.userId = userId;
//     }

//     const order = await this.orderRepository.findOne({
//       where: whereCondition,
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });

//     if (!order) {
//       throw new NotFoundException(`Ordine ${id} non trovato`);
//     }

//     return order;
//   }

//   /**
//    * Trova ordine per orderNumber
//    */
//   async findByOrderNumber(orderNumber: string): Promise<Order> {
//     const order = await this.orderRepository.findOne({
//       where: { orderNumber },
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });

//     if (!order) {
//       throw new NotFoundException(`Ordine ${orderNumber} non trovato`);
//     }

//     return order;
//   }

//   /**
//    * Trova ordine per Stripe PaymentIntent ID
//    */
//   async findByPaymentIntentId(
//     paymentIntentId: string,
//     userId?: string
//   ): Promise<Order | null> {
//     const where: any = { stripePaymentIntentId: paymentIntentId };
//     if (userId) {
//       where.userId = userId;
//     }

//     return this.orderRepository.findOne({
//       where,
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });
//   }

//   /**
//    * Trova ordine per Stripe Session ID
//    */
//   async findByStripeSessionId(
//     sessionId: string,
//     userId?: string
//   ): Promise<Order | null> {
//     const where: any = { stripeSessionId: sessionId };
//     if (userId) {
//       where.userId = userId;
//     }

//     return this.orderRepository.findOne({
//       where,
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });
//   }

//   /**
//    * Trova ordine per tracking token (guest tracking)
//    */
//   async findByTrackingToken(
//     trackingToken: string,
//     email: string
//   ): Promise<Order | null> {
//     return this.orderRepository.findOne({
//       where: {
//         trackingToken,
//         customerEmail: email.toLowerCase()
//       },
//       relations: ['items', 'items.product']
//     });
//   }

//   async checkTrackingTokenExists(token: string): Promise<boolean> {
//     const order = await this.orderRepository.findOne({
//       where: { trackingToken: token }
//     });
//     return !!order;
//   }

//   /**
//    * Ottieni ultimo ordine utente
//    */
//   async getLastUserOrder(userId: string): Promise<Order | null> {
//     return this.orderRepository.findOne({
//       where: {
//         userId,
//         status: In([
//           OrderStatus.PENDING,
//           OrderStatus.CONFIRMED,
//           OrderStatus.PROCESSING,
//           OrderStatus.SHIPPED,
//           OrderStatus.IN_TRANSIT,
//           OrderStatus.OUT_FOR_DELIVERY,
//           OrderStatus.DELIVERED
//         ])
//       },
//       order: { createdAt: 'DESC' },
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });
//   }

//   /**
//    * Ottieni ultimo ordine PENDING dell'utente
//    */
//   async getLastPendingOrder(userId: string): Promise<Order | null> {
//     return this.orderRepository.findOne({
//       where: {
//         userId,
//         status: OrderStatus.PENDING
//       },
//       order: { createdAt: 'DESC' },
//       relations: ['items', 'items.product', 'user', 'payment'],
//     });
//   }

//   /**
//    * Ottieni ordini utente con filtri e paginazione
//    */
//   async findUserOrders(
//     userId: string,
//     filters?: Partial<OrderFilterDto>
//   ): Promise<OrderListResponseDto> {
//     const query = this.orderRepository
//       .createQueryBuilder('order')
//       .leftJoinAndSelect('order.items', 'items')
//       .leftJoinAndSelect('items.product', 'product')
//       .where('order.userId = :userId', { userId });

//     this.applyFilters(query, filters);

//     const page = filters?.page || 1;
//     const limit = filters?.limit || 20;
//     const offset = (page - 1) * limit;

//     query.skip(offset).take(limit);

//     const [orders, total] = await query.getManyAndCount();

//     return this.buildOrderListResponse(orders, total, page, limit);
//   }

//   /**
//    * Ottieni tutti gli ordini (admin) con filtri
//    */
//   async findAll(filters?: OrderFilterDto): Promise<OrderListResponseDto> {
//     const query = this.orderRepository
//       .createQueryBuilder('order')
//       .leftJoinAndSelect('order.items', 'items')
//       .leftJoinAndSelect('items.product', 'product')
//       .leftJoinAndSelect('order.user', 'user')

//     this.applyFilters(query, filters);

//     const page = filters?.page || 1;
//     const limit = filters?.limit || 20;
//     const offset = (page - 1) * limit;

//     query.skip(offset).take(limit);

//     const [orders, total] = await query.getManyAndCount();

//     return this.buildOrderListResponse(orders, total, page, limit);
//   }

//   /**
//    * Ottieni dettaglio ordine (DTO)
//    */
//   async findOneDetailed(
//     id: string,
//     userId?: string
//   ): Promise<OrderResponseDto> {
//     const order = await this.findOne(id, userId);
//     return plainToClass(OrderResponseDto, order, {
//       excludeExtraneousValues: true,
//     });
//   }

//   // ===========================
//   // 📈 STATISTICS & REPORTS
//   // ===========================

//   /**
//    * Statistiche ordini complete
//    */
//   async getOrderStats(): Promise<any> {
//     const baseQuery = this.orderRepository.createQueryBuilder('order');

//     const [
//       totalOrders,
//       pendingOrders,
//       confirmedOrders,
//       processingOrders,
//       shippedOrders,
//       deliveredOrders,
//       cancelledOrders,
//     ] = await Promise.all([
//       baseQuery.getCount(),
//       this.countByStatus(OrderStatus.PENDING),
//       this.countByStatus(OrderStatus.CONFIRMED),
//       this.countByStatus(OrderStatus.PROCESSING),
//       this.countByStatus(OrderStatus.SHIPPED),
//       this.countByStatus(OrderStatus.DELIVERED),
//       this.countByStatus(OrderStatus.CANCELLED),
//     ]);

//     // Revenue da ordini confermati/processati/spediti/consegnati
//     const revenueStatuses = [
//       OrderStatus.CONFIRMED,
//       OrderStatus.PROCESSING,
//       OrderStatus.SHIPPED,
//       OrderStatus.IN_TRANSIT,
//       OrderStatus.OUT_FOR_DELIVERY,
//       OrderStatus.DELIVERED,
//     ];

//     const revenueResult = await this.orderRepository
//       .createQueryBuilder('order')
//       .select('SUM(order.total)', 'total')
//       .where('order.status IN (:...statuses)', { statuses: revenueStatuses })
//       .getRawOne();

//     const totalRevenue = parseFloat(revenueResult?.total || '0');
//     const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

//     // Stats mensili
//     const currentMonth = new Date();
//     currentMonth.setDate(1);
//     currentMonth.setHours(0, 0, 0, 0);

//     const [revenueThisMonth, ordersThisMonth] = await Promise.all([
//       this.orderRepository
//         .createQueryBuilder('order')
//         .select('SUM(order.total)', 'total')
//         .where('order.createdAt >= :startOfMonth', { startOfMonth: currentMonth })
//         .andWhere('order.status IN (:...statuses)', { statuses: revenueStatuses })
//         .getRawOne(),
//       baseQuery
//         .clone()
//         .where('order.createdAt >= :startOfMonth', { startOfMonth: currentMonth })
//         .getCount(),
//     ]);

//     // Top prodotti
//     const topProducts = await this.getTopProducts();

//     return {
//       totalOrders,
//       pendingOrders,
//       confirmedOrders,
//       processingOrders,
//       shippedOrders,
//       deliveredOrders,
//       cancelledOrders,
//       totalRevenue: this.roundToTwo(totalRevenue),
//       averageOrderValue: this.roundToTwo(averageOrderValue),
//       revenueThisMonth: this.roundToTwo(parseFloat(revenueThisMonth?.total || '0')),
//       ordersThisMonth,
//       topProducts,
//     };
//   }

//   // ===========================
//   // 🔧 ORDER STATUS MANAGEMENT
//   // ===========================

//   /**
//    * Aggiorna stato ordine
//    */
//   async updateOrderStatus(
//     orderId: string,
//     updateDto: UpdateOrderStatusDto
//   ): Promise<Order> {
//     const order = await this.findOne(orderId);

//     if (!this.canTransitionToStatus(order.status, updateDto.status)) {
//       throw new BadRequestException(
//         `Impossibile cambiare stato da ${order.status} a ${updateDto.status}`
//       );
//     }

//     order.status = updateDto.status;
//     if (updateDto.trackingNumber) {
//       order.trackingNumber = updateDto.trackingNumber;
//     }
//     if (updateDto.notes) {
//       order.notes = updateDto.notes;
//     }

//     const updatedOrder = await this.orderRepository.save(order);

//     this.logger.log(
//       `📦 Ordine ${order.orderNumber} → ${updateDto.status}`
//     );

//     // Emit eventi per status specifici
//     if (updateDto.status === OrderStatus.SHIPPED) {
//       this.eventEmitter.emit('order.shipped', {
//         orderId: order.id,
//         orderNumber: order.orderNumber,
//         customerEmail: order.customerEmail,
//         trackingNumber: updateDto.trackingNumber,
//       });
//     }

//     return updatedOrder;
//   }

//   /**
//    * Processa reso prodotti
//    */
//   async processReturn(
//     orderId: string,
//     returnItems: Array<{
//       productId: string;
//       quantity: number;
//       reason: string;
//     }>,
//     userId?: string
//   ): Promise<{
//     success: boolean;
//     message: string;
//     returnedItems: number;
//     restockedItems: number;
//     errors: string[];
//   }> {
//     const order = await this.findOne(orderId, userId);

//     if (!order.isRefundable()) {
//       throw new BadRequestException(
//         `Ordine ${order.orderNumber} non può essere reso (stato: ${order.status})`
//       );
//     }

//     const results = {
//       success: true,
//       message: '',
//       returnedItems: 0,
//       restockedItems: 0,
//       errors: [] as string[],
//     };

//     for (const returnItem of returnItems) {
//       try {
//         const orderItem = order.items.find(
//           (item) => item.productId === returnItem.productId
//         );

//         if (!orderItem) {
//           results.errors.push(
//             `Prodotto ${returnItem.productId} non trovato nell'ordine`
//           );
//           continue;
//         }

//         if (returnItem.quantity > orderItem.quantity) {
//           results.errors.push(
//             `Quantità reso (${returnItem.quantity}) > ordinata (${orderItem.quantity})`
//           );
//           continue;
//         }

//         await this.inventoryService.recordReturnMovement(
//           returnItem.productId,
//           returnItem.quantity,
//           order.id,
//           userId
//         );

//         results.returnedItems++;
//         results.restockedItems++;

//         this.logger.log(
//           `🔄 Reso: ${returnItem.productId} x${returnItem.quantity} ` +
//           `(Ordine ${order.orderNumber})`
//         );
//       } catch (error) {
//         results.errors.push(
//           `Errore reso ${returnItem.productId}: ${error.message}`
//         );
//         results.success = false;
//       }
//     }

//     results.message =
//       `Processati ${results.returnedItems} resi, ` +
//       `${results.restockedItems} ripristinati, ` +
//       `${results.errors.length} errori`;

//     return results;
//   }

//   // ===========================
//   // 🔍 TRACKING & GUEST ACCESS
//   // ===========================

//   /**
//    * Tracking pubblico ordine (per guest)
//    */
//   async trackOrderPublic(trackingToken: string, email: string) {
//     const order = await this.findByTrackingToken(trackingToken, email);

//     if (!order) {
//       throw new NotFoundException('Ordine non trovato con questi dati');
//     }

//     return {
//       id: order.id,
//       orderNumber: order.orderNumber,
//       status: order.status,
//       total: order.total,
//       createdAt: order.createdAt,
//       updatedAt: order.updatedAt,
//       trackingToken: order.trackingToken,
//       shippingAddress: order.shippingAddress,
//       estimatedDelivery: order.estimatedDelivery,
//       trackingNumber: order.trackingNumber,
//       brtTrackingNumber: order.brtTrackingNumber,
//       items: order.items.map(item => ({
//         id: item.id,
//         quantity: item.quantity,
//         unitPrice: item.unitPrice,
//         subtotal: item.total,
//         product: {
//           id: item.product.id,
//           name: item.product.name,
//           image: item.product.images?.[0]
//         }
//       }))
//     };
//   }

//   /**
//    * Aggiorna stato spedizione (da webhook BRT)
//    */
//   async updateShippingStatus(
//     trackingNumber: string,
//     status: OrderStatus,
//     estimatedDelivery?: Date
//   ): Promise<void> {
//     await this.orderRepository.update(
//       { trackingNumber },
//       {
//         status,
//         estimatedDelivery,
//         updatedAt: new Date()
//       }
//     );

//     this.logger.log(
//       `📦 Tracking ${trackingNumber} aggiornato → ${status}`
//     );
//   }

//   // ===========================
//   // 🛠️ UTILITY & VALIDATION
//   // ===========================

//   /**
//    * Valida disponibilità stock per items
//    * (Considera availableStock = stock - reservedStock)
//    */
//   private async validateAvailableStock(
//     items: Array<{ productId: string; quantity: number }>
//   ): Promise<{
//     valid: boolean;
//     errors: string[];
//     warnings: string[];
//   }> {
//     const validation = {
//       valid: true,
//       errors: [] as string[],
//       warnings: [] as string[],
//     };

//     for (const item of items) {
//       try {
//         const stockCheck = await this.inventoryService.validateStockAvailability(
//           item.productId,
//           item.quantity
//         );

//         if (!stockCheck.available) {
//           validation.valid = false;
//           validation.errors.push(
//             `Stock insufficiente per ${stockCheck.itemInfo.name}: ` +
//             `richiesto ${item.quantity}, disponibile ${stockCheck.availableStock}`
//           );
//         } else if (stockCheck.availableStock <= 5) {
//           validation.warnings.push(
//             `Stock basso per ${stockCheck.itemInfo.name}: ` +
//             `solo ${stockCheck.availableStock} disponibili`
//           );
//         }
//       } catch (error) {
//         validation.valid = false;
//         validation.errors.push(
//           `Errore validazione ${item.productId}: ${error.message}`
//         );
//       }
//     }

//     return validation;
//   }

//   /**
//    * Genera numero ordine univoco (MRVYYYYMMDDXXX)
//    */
//   private async generateOrderNumberSafe(
//     manager: EntityManager
//   ): Promise<string> {
//     const now = new Date();
//     const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
//     const prefix = `MRV${datePrefix}`;

//     const row = await manager
//       .createQueryBuilder(Order, 'o')
//       .select('MAX(o.orderNumber)', 'max')
//       .where('o.orderNumber LIKE :p', { p: `${prefix}%` })
//       .getRawOne<{ max: string | null }>();

//     const last = row?.max || null;
//     const lastSeq = last ? parseInt(last.slice(-3), 10) || 0 : 0;
//     const nextSeq = String(lastSeq + 1).padStart(3, '0');

//     return `${prefix}${nextSeq}`;
//   }

//   /**
//    * Verifica se transizione di stato è valida
//    */
//   private canTransitionToStatus(
//     currentStatus: OrderStatus,
//     newStatus: OrderStatus
//   ): boolean {
//     const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
//       [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
//       [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
//       [OrderStatus.PROCESSING]: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
//       [OrderStatus.READY_TO_SHIP]: [OrderStatus.SHIPPED],
//       [OrderStatus.SHIPPED]: [OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
//       [OrderStatus.IN_TRANSIT]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
//       [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
//       [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
//       [OrderStatus.CANCELLED]: [],
//       [OrderStatus.REFUNDED]: [],
//     };

//     return allowedTransitions[currentStatus]?.includes(newStatus) || false;
//   }

//   /**
//    * Applica filtri a query ordini
//    */
//   private applyFilters(query: any, filters?: Partial<OrderFilterDto>): void {
//     if (filters?.status) {
//       query.andWhere('order.status = :status', { status: filters.status });
//     }
//     if (filters?.userId) {
//       query.andWhere('order.userId = :userId', { userId: filters.userId });
//     }
//     if (filters?.orderNumber) {
//       query.andWhere('order.orderNumber LIKE :orderNumber', {
//         orderNumber: `%${filters.orderNumber}%`,
//       });
//     }
//     if (filters?.startDate) {
//       query.andWhere('order.createdAt >= :startDate', {
//         startDate: filters.startDate,
//       });
//     }
//     if (filters?.endDate) {
//       query.andWhere('order.createdAt <= :endDate', {
//         endDate: filters.endDate,
//       });
//     }
//     if (filters?.minAmount) {
//       query.andWhere('order.total >= :minAmount', {
//         minAmount: filters.minAmount,
//       });
//     }
//     if (filters?.maxAmount) {
//       query.andWhere('order.total <= :maxAmount', {
//         maxAmount: filters.maxAmount,
//       });
//     }

//     const sortBy = filters?.sortBy || 'createdAt';
//     const sortOrder = filters?.sortOrder || 'DESC';
//     query.orderBy(`order.${sortBy}`, sortOrder);
//   }

//   /**
//    * Costruisce risposta paginata
//    */
//   private buildOrderListResponse(
//     orders: Order[],
//     total: number,
//     page: number,
//     limit: number
//   ): OrderListResponseDto {
//     const orderDtos = orders.map((order) =>
//       plainToClass(OrderResponseDto, order, {
//         excludeExtraneousValues: true,
//       })
//     );

//     return {
//       orders: orderDtos,
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//       hasNext: page < Math.ceil(total / limit),
//       hasPrev: page > 1,
//     };
//   }

//   /**
//    * Conta ordini per stato
//    */
//   private async countByStatus(status: OrderStatus): Promise<number> {
//     return this.orderRepository.count({ where: { status } });
//   }

//   /**
//    * Ottieni top prodotti venduti
//    */
//   private async getTopProducts(): Promise<Array<{
//     productName: string;
//     quantitySold: number;
//     revenue: number;
//   }>> {
//     const results = await this.orderRepository
//       .createQueryBuilder('order')
//       .leftJoin('order.items', 'items')
//       .select([
//         'items.productName as productName',
//         'SUM(items.quantity) as quantitySold',
//         'SUM(items.total) as revenue',
//       ])
//       .where('order.status IN (:...statuses)', {
//         statuses: [
//           OrderStatus.CONFIRMED,
//           OrderStatus.PROCESSING,
//           OrderStatus.SHIPPED,
//           OrderStatus.DELIVERED,
//         ],
//       })
//       .groupBy('items.productName')
//       .orderBy('SUM(items.total)', 'DESC')
//       .limit(10)
//       .getRawMany();

//     return results.map((product) => ({
//       productName: product.productName,
//       quantitySold: parseInt(product.quantitySold),
//       revenue: parseFloat(product.revenue),
//     }));
//   }

//   /**
//    * Arrotonda a 2 decimali
//    */
//   private roundToTwo(value: number): number {
//     return Math.round((value + Number.EPSILON) * 100) / 100;
//   }

//   /**
//    * Valida numero (fallback a default)
//    */
//   private validateNumber(value: any, defaultValue: number = 0): number {
//     if (value === null || value === undefined) return defaultValue;
//     const num = typeof value === 'string' ? parseFloat(value) : Number(value);
//     return isNaN(num) || !isFinite(num) ? defaultValue : num;
//   }

//   /**
//    * Valida importo
//    */
//   private isValidAmount(amount: any): boolean {
//     const num = this.validateNumber(amount);
//     return num >= 0 && num <= 999999.99 && isFinite(num);
//   }
// }