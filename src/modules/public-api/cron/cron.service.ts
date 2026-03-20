import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

// Entities
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { StockReservation, ReservationStatus } from 'src/database/entities/stock-reservation.entity';
import { User, UserRole } from 'src/database/entities/user.entity';
import { Cart } from 'src/database/entities/cart.entity';

// Services
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from 'src/modules/admin-api/inventory/inventory.service';
import { DailyReportService } from 'src/modules/admin-api/shipments/daily-report.service';
import { ShipmentsService } from '../brt/shipments/shipments.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(StockReservation)
    private reservationRepository: Repository<StockReservation>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Cart)
    private cartsRepository: Repository<Cart>,
    private inventoryService: InventoryService,
    private ordersService: OrdersService,
    private notificationsService: NotificationsService,
    private shipmentsService: ShipmentsService,
    private dailyReportService: DailyReportService,
  ) {
    this.logger.log('🕐 CronService inizializzato con job BRT');
  }

  // ===========================
  // ⏰ AUTO-PROCESSING WORKFLOW (2 FASI)
  // ===========================

  /**
   * FASE 1: AUTO-CONFIRM TO PROCESSING
   * CONFIRMED (> 5 min TEST / 1h PROD) → PROCESSING
   * 
   * ⚠️ VALORI TEST: 5 min (in produzione: 1h)
   * Permette finestra per modifiche manuali prima dell'elaborazione automatica
   * Eseguito ogni 30 minuti
   */
  @Cron('*/30 * * * *', {
    name: 'auto-confirm-to-processing',
    timeZone: 'Europe/Rome',
  })
  async autoConfirmToProcessing(): Promise<void> {
    this.logger.log('⏰ [CRON FASE 1] Auto-confirm to PROCESSING - START');

    try {
      // ⚠️ TEST: 5 min | PROD: 1h
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
      // const oneHourAgo = new Date();
      // oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const ordersToProcess = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.payment', 'payment')
        .where('order.status = :status', { status: OrderStatus.CONFIRMED })
        .andWhere('order.createdAt <= :threshold', { threshold: fiveMinutesAgo }) // TEST: 5min | PROD: oneHourAgo
        .andWhere('payment.status = :paymentStatus', { paymentStatus: 'succeeded' })
        .getMany();

      if (ordersToProcess.length === 0) {
        this.logger.debug('✅ [CRON FASE 1] Nessun ordine da passare in PROCESSING');
        this.logger.log('⏰ [CRON FASE 1] Auto-confirm to PROCESSING - END');
        return;
      }

      this.logger.log(
        `🔄 [CRON FASE 1] Trovati ${ordersToProcess.length} ordini CONFIRMED da > 5 min (TEST)`,
      );

      let processed = 0;
      let errors = 0;

      for (const order of ordersToProcess) {
        try {
          this.logger.log(
            `📦 [CRON FASE 1] Ordine ${order.orderNumber} → PROCESSING`,
          );

          order.status = OrderStatus.PROCESSING;
          await this.orderRepository.save(order);
          processed++;

          this.logger.log(
            `✅ [CRON FASE 1] Ordine ${order.orderNumber} passato in PROCESSING`,
          );
        } catch (error) {
          errors++;
          this.logger.error(
            `❌ [CRON FASE 1] Errore processing ${order.orderNumber}:`,
            error.message,
          );
        }
      }

      this.logger.log(
        `✅ [CRON FASE 1] Completata: ${processed} ordini in PROCESSING, ${errors} errori`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON FASE 1] Errore:', error.stack);
    }

    this.logger.log('⏰ [CRON FASE 1] Auto-confirm to PROCESSING - END');
  }

  /**
   * FASE 2: AUTO-CREATE SHIPMENT LABELS
   * PROCESSING (> 2 min TEST / 15 min PROD) → Crea etichetta BRT → READY_TO_SHIP
   * 
   * ⚠️ VALORI TEST: 2 min (in produzione: 15 min)
   * Genera automaticamente le etichette per ordini in processing
   * Eseguito ogni 15 minuti
   */
  @Cron('*/15 * * * *', {
    name: 'auto-create-shipment-labels',
    timeZone: 'Europe/Rome',
  })
  async autoCreateShipmentLabels(): Promise<void> {
    this.logger.log('⏰ [CRON FASE 2] Auto-create shipment labels - START');

    try {
      // ⚠️ TEST: 2 min | PROD: 15 min
      const twoMinutesAgo = new Date();
      twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2);
      // const fifteenMinutesAgo = new Date();
      // fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

      const ordersToShip = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.payment', 'payment')
        .leftJoinAndSelect('order.items', 'items')
        .leftJoinAndSelect('items.variant', 'variant')
        .leftJoinAndSelect('variant.product', 'product')
        .where('order.status = :status', { status: OrderStatus.PROCESSING })
        .andWhere('order.shipmentId IS NULL')
        .andWhere('order.updatedAt <= :threshold', { threshold: twoMinutesAgo }) // TEST: 2min | PROD: fifteenMinutesAgo
        .andWhere('payment.status = :paymentStatus', { paymentStatus: 'succeeded' })
        .getMany();

      if (ordersToShip.length === 0) {
        this.logger.debug('✅ [CRON FASE 2] Nessun ordine da spedire');
        this.logger.log('⏰ [CRON FASE 2] Auto-create shipment labels - END');
        return;
      }

      this.logger.log(
        `🔄 [CRON FASE 2] Trovati ${ordersToShip.length} ordini PROCESSING da > 2 min (TEST) pronti per etichetta`,
      );

      let shipped = 0;
      let errors = 0;

      for (const order of ordersToShip) {
        try {
          this.logger.log(
            `📦 [CRON FASE 2] Creazione etichetta per ${order.orderNumber} (ID: ${order.id})`,
          );

          const shipmentResult = await this.shipmentsService.createShipmentForOrder(
            order.id,
            {
              generateLabel: true,
              notes: 'Auto-generato dal sistema (TEST: 2 min | PROD: 15 min processing)',
            },
          );

          order.status = OrderStatus.READY_TO_SHIP;
          await this.orderRepository.save(order);

          const customerEmail = order.getCustomerEmail();
          if (customerEmail && shipmentResult.trackingNumber) {
            this.logger.log(
              `📧 Email conferma spedizione da inviare a ${customerEmail} - Tracking: ${shipmentResult.trackingNumber}`,
            );
          }

          shipped++;

          this.logger.log(
            `✅ [CRON FASE 2] Ordine ${order.orderNumber} → READY_TO_SHIP con etichetta`,
          );
        } catch (error) {
          errors++;
          this.logger.error(
            `❌ [CRON FASE 2] Errore creazione etichetta ${order.orderNumber}:`,
            error.message,
          );
        }
      }

      this.logger.log(
        `✅ [CRON FASE 2] Completata: ${shipped} etichette create, ${errors} errori`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON FASE 2] Errore:', error.stack);
    }

    this.logger.log('⏰ [CRON FASE 2] Auto-create shipment labels - END');
  }

  // ===========================
  // 🧹 CLEANUP EXPIRED RESERVATIONS (Ogni 10 minuti)
  // ===========================

  @Cron('*/10 * * * *', {
    name: 'cleanup-expired-reservations',
    timeZone: 'Europe/Rome',
  })
  async cleanupExpiredReservations(): Promise<void> {
    this.logger.log('🧹 [CRON] Cleanup expired reservations - START');

    try {
      const result = await this.inventoryService.cleanupExpiredReservations();

      if (result.cleaned > 0) {
        this.logger.log(
          `✅ [CRON] Cleanup completato: ${result.cleaned} reservations pulite`,
        );

        for (const reservation of result.releasedReservations) {
          this.logger.log(
            `   ├─ Ordine ${reservation.orderId}: ` +
              `${reservation.productName} x${reservation.quantity} ` +
              `(scaduta: ${reservation.expiredAt.toLocaleString('it-IT')})`,
          );
        }
      } else {
        this.logger.debug('✅ [CRON] Nessuna reservation scaduta');
      }
    } catch (error) {
      this.logger.error('❌ [CRON] Errore cleanup reservations:', error.stack);
    }

    this.logger.log('🧹 [CRON] Cleanup expired reservations - END');
  }

  // ===========================
  // 📦 DAILY SHIPMENT REPORT (Ogni giorno alle 18:00)
  // ===========================

  /**
   * 🆕 NUOVO: Report giornaliero spedizioni BRT
   * - Genera Excel dettaglio ordini
   * - Genera ZIP etichette
   * - Invia email a magazzino Tortoreto
   * 
   * Eseguito ogni giorno alle 18:00
   */
  @Cron('0 18 * * *', {
    name: 'daily-shipment-report',
    timeZone: 'Europe/Rome',
  })
  async generateDailyShipmentReport(): Promise<void> {
    this.logger.log('📦 [CRON] Daily shipment report - START');

    try {
      // 1. Genera report
      const reportData = await this.dailyReportService.generateDailyReport();

      if (!reportData) {
        this.logger.log('ℹ️ [CRON] Nessun ordine per oggi - report skip');
        return;
      }

      // 2. Invia email riepilogo
      await this.dailyReportService.sendDailyReportEmail(reportData);

      this.logger.log(
        `✅ [CRON] Report inviato: ${reportData.totalOrders} ordini, ` +
          `${reportData.totalParcels} colli, €${reportData.totalValue.toFixed(2)}`,
      );

      // 3. Cleanup file dopo 24h (opzionale)
      setTimeout(async () => {
        await this.dailyReportService.deleteReportFile(reportData.excelPath);
        await this.dailyReportService.deleteReportFile(reportData.zipPath);
      }, 24 * 60 * 60 * 1000);
    } catch (error) {
      this.logger.error('❌ [CRON] Errore daily report:', error.stack);
    }

    this.logger.log('📦 [CRON] Daily shipment report - END');
  }

  // ===========================
  // 🔄 UPDATE BRT TRACKING (Ogni 2 ore)
  // ===========================

  /**
   * 🆕 NUOVO: Aggiorna tracking ordini spediti
   * - Query ordini SHIPPED/IN_TRANSIT/OUT_FOR_DELIVERY
   * - Chiama BRT API tracking
   * - Aggiorna stato ordine se cambiato
   * - Invia email su milestone (OUT_FOR_DELIVERY, DELIVERED)
   * 
   * Eseguito ogni 2 ore
   */
  @Cron('0 */2 * * *', {
    name: 'update-brt-tracking',
    timeZone: 'Europe/Rome',
  })
  async updateBrtTracking(): Promise<void> {
    this.logger.log('🔄 [CRON] Update BRT tracking - START');

    try {
      const result = await this.shipmentsService.updateShipmentsTracking();

      this.logger.log(
        `✅ [CRON] Tracking update: ${result.updated} aggiornati, ` +
          `${result.unchanged} invariati, ${result.errors} errori`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON] Errore update tracking:', error.stack);
    }

    this.logger.log('🔄 [CRON] Update BRT tracking - END');
  }

  // ===========================
  // 🗑️ CLEANUP ABANDONED ORDERS (Ogni notte alle 3:00)
  // ===========================

  @Cron('0 3 * * *', {
    name: 'cleanup-abandoned-orders',
    timeZone: 'Europe/Rome',
  })
  async cleanupAbandonedOrders(): Promise<void> {
    this.logger.log('🗑️ [CRON] Cleanup abandoned orders - START');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 14); // 14 giorni fa

      const abandonedOrders = await this.orderRepository.find({
        where: {
          status: OrderStatus.PENDING,
          createdAt: LessThan(cutoffDate),
        },
        relations: ['items'],
      });

      if (abandonedOrders.length === 0) {
        this.logger.log('✅ [CRON] Nessun ordine abbandonato da pulire');
        return;
      }

      this.logger.log(
        `🔄 [CRON] Trovati ${abandonedOrders.length} ordini abbandonati da pulire`,
      );

      let cleaned = 0;
      let errors = 0;

      for (const order of abandonedOrders) {
        try {
          await this.ordersService.cancelOrder(
            order.id,
            'Ordine abbandonato - cleanup automatico dopo 14 giorni',
          );

          this.logger.log(
            `   ├─ Cancellato: ${order.orderNumber} ` +
              `(creato: ${order.createdAt.toLocaleDateString('it-IT')})`,
          );
          cleaned++;
        } catch (error) {
          this.logger.error(
            `   ├─ Errore cancellazione ${order.orderNumber}:`,
            error.message,
          );
          errors++;
        }
      }

      this.logger.log(
        `✅ [CRON] Cleanup completato: ${cleaned} ordini cancellati, ${errors} errori`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON] Errore cleanup abandoned orders:', error.stack);
    }

    this.logger.log('🗑️ [CRON] Cleanup abandoned orders - END');
  }

  // ===========================
  // 📧 CART RECOVERY EMAILS (Ogni ora)
  // ===========================

  @Cron('0 * * * *', {
    name: 'send-cart-recovery-emails',
    timeZone: 'Europe/Rome',
  })
  async sendCartRecoveryEmails(): Promise<void> {
    this.logger.log('📧 [CRON] Send cart recovery emails - START');

    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      const pendingOrders = await this.orderRepository.find({
        where: {
          status: OrderStatus.PENDING,
          createdAt: LessThan(cutoffDate),
          recoveryEmailSent: false,
        },
        relations: ['items', 'items.variant', 'items.variant.product', 'user'],
        take: 50,
      });

      if (pendingOrders.length === 0) {
        this.logger.debug('✅ [CRON] Nessun carrello da recuperare');
        return;
      }

      this.logger.log(
        `🔄 [CRON] Trovati ${pendingOrders.length} carrelli da recuperare`,
      );

      let sent = 0;
      let skipped = 0;
      let errors = 0;

      for (const order of pendingOrders) {
        try {
          if (
            order.stockReservationExpiresAt &&
            order.stockReservationExpiresAt < new Date()
          ) {
            this.logger.debug(
              `   ├─ Skip ${order.orderNumber}: reservation scaduta`,
            );
            skipped++;
            continue;
          }

          const email = order.customerEmail || order.user?.email;
          if (!email) {
            this.logger.warn(
              `   ├─ Skip ${order.orderNumber}: email non disponibile`,
            );
            skipped++;
            continue;
          }

          await this.notificationsService.sendCartRecoveryEmail({
            email,
            orderNumber: order.orderNumber,
            trackingToken: order.trackingToken!,
            items: order.items.map((item) => ({
              name: item.productName,
              quantity: item.quantity,
              price: item.unitPrice,
              image: (item.variant?.product as any)?.images?.[0],
            })),
            total: order.total,
            expiresAt: order.stockReservationExpiresAt,
          });

          await this.orderRepository.update(order.id, {
            recoveryEmailSent: true,
            recoveryEmailSentAt: new Date(),
            recoveryEmailCount: (order.recoveryEmailCount || 0) + 1,
          });

          this.logger.log(`   ├─ Inviato: ${order.orderNumber} → ${email}`);
          sent++;
        } catch (error) {
          this.logger.error(
            `   ├─ Errore invio ${order.orderNumber}:`,
            error.message,
          );
          errors++;
        }
      }

      this.logger.log(
        `✅ [CRON] Recovery emails: ${sent} inviati, ${skipped} skipped, ${errors} errori`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON] Errore cart recovery:', error.stack);
    }

    this.logger.log('📧 [CRON] Send cart recovery emails - END');
  }

  // ===========================
  // ⚠️ LOW STOCK ALERTS (Ogni giorno alle 9:00)
  // ===========================

  @Cron('0 9 * * *', {
    name: 'check-low-stock-alert',
    timeZone: 'Europe/Rome',
  })
  async checkLowStockAlert(): Promise<void> {
    this.logger.log('⚠️ [CRON] Check low stock alert - START');

    try {
      await this.inventoryService.checkLowStockAndAlert();
      this.logger.log('✅ [CRON] Low stock alert completato');
    } catch (error) {
      this.logger.error('❌ [CRON] Errore low stock alert:', error.stack);
    }

    this.logger.log('⚠️ [CRON] Check low stock alert - END');
  }

  // ===========================
  // 🧹 CLEANUP GUEST DATA (Ogni settimana - Domenica alle 4:00)
  // ===========================

  @Cron('0 4 * * 0', {
    name: 'cleanup-guest-data',
    timeZone: 'Europe/Rome',
  })
  async cleanupGuestData(): Promise<void> {
    this.logger.log('🧹 [CRON] Cleanup guest data - START');

    try {
      // Cleanup guest users orfani
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const orphanGuests = await this.usersRepository
        .createQueryBuilder('user')
        .leftJoin('user.orders', 'orders')
        .where('user.role = :role', { role: UserRole.GUEST })
        .andWhere('user.createdAt < :cutoffDate', { cutoffDate })
        .andWhere('orders.id IS NULL')
        .getMany();

      if (orphanGuests.length > 0) {
        for (const guest of orphanGuests) {
          await this.usersRepository.delete({ id: guest.id });
        }

        this.logger.log(
          `✅ [CRON] ${orphanGuests.length} guest users orfani eliminati`,
        );
      }

      // Cleanup carrelli vuoti
      const cartCutoffDate = new Date();
      cartCutoffDate.setDate(cartCutoffDate.getDate() - 7);

      const emptyCarts = await this.cartsRepository
        .createQueryBuilder('cart')
        .leftJoin('cart.items', 'items')
        .where('cart.updatedAt < :cutoffDate', { cutoffDate: cartCutoffDate })
        .andWhere('items.id IS NULL')
        .getMany();

      if (emptyCarts.length > 0) {
        for (const cart of emptyCarts) {
          await this.cartsRepository.delete({ id: cart.id });
        }

        this.logger.log(
          `✅ [CRON] ${emptyCarts.length} carrelli vuoti eliminati`,
        );
      }

      this.logger.log('✅ [CRON] Guest data cleanup completato');
    } catch (error) {
      this.logger.error('❌ [CRON] Errore cleanup guest data:', error.stack);
    }

    this.logger.log('🧹 [CRON] Cleanup guest data - END');
  }

  // ===========================
  // 📊 DAILY STATS REPORT (Ogni giorno alle 8:00)
  // ===========================

  @Cron('0 8 * * *', {
    name: 'daily-stats-report',
    timeZone: 'Europe/Rome',
  })
  async generateDailyStatsReport(): Promise<void> {
    this.logger.log('📊 [CRON] Daily stats report - START');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ordersCount = await this.orderRepository.count({
        where: {
          createdAt: LessThan(today),
          status: OrderStatus.CONFIRMED,
        },
      });

      this.logger.log(`📈 [CRON] Stats ieri: ${ordersCount} ordini confermati`);
      this.logger.log('✅ [CRON] Daily stats report completato');
    } catch (error) {
      this.logger.error('❌ [CRON] Errore stats report:', error.stack);
    }

    this.logger.log('📊 [CRON] Daily stats report - END');
  }

  // ===========================
  // 🏥 HEALTH CHECK (Ogni 6 ore)
  // ===========================

  @Cron('0 */6 * * *', {
    name: 'cron-health-check',
    timeZone: 'Europe/Rome',
  })
  async cronHealthCheck(): Promise<void> {
    this.logger.log('🏥 [CRON] Health check');

    try {
      const activeReservations = await this.reservationRepository.count({
        where: { status: ReservationStatus.RESERVED },
      });

      const pendingOrders = await this.orderRepository.count({
        where: { status: OrderStatus.PENDING },
      });

      const readyToShip = await this.orderRepository.count({
        where: { status: OrderStatus.READY_TO_SHIP },
      });

      this.logger.log(
        `✅ [CRON] Sistema OK - ` +
          `Reservations: ${activeReservations}, ` +
          `Pending: ${pendingOrders}, ` +
          `Ready to ship: ${readyToShip}`,
      );
    } catch (error) {
      this.logger.error('❌ [CRON] Health check failed:', error.stack);
    }
  }
}