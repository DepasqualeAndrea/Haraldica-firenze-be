// src/modules/public-api/brt/shipments/shipments.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Entities
import { Shipment, ShipmentStatus } from 'src/database/entities/shipment.entity';
import { Order, OrderStatus } from 'src/database/entities/order.entity';

// Services
import { NotificationsService } from '../../notifications/notifications.service';
import { BrtService } from '../brt.service';

// DTOs
import {
  BrtShipmentResponseDto,
  BrtTrackingInfoDto,
} from '../dto/brt-shipment-response.dto';
import {
  CreateBrtShipmentDto,
  ConfirmBrtShipmentDto,
  BulkConfirmBrtShipmentsDto,
  DeleteBrtShipmentDto,
  TrackBrtShipmentDto,
  GetReadyToShipDto,
} from '../dto/create-brt-shipment.dto';

// BRT API Interfaces
import { BrtLabel } from '../interface/brt-api.interface';
import { S3Service } from '../S3/s3.service';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private brtService: BrtService,
    private notificationsService: NotificationsService,
    private s3Service: S3Service,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {
    this.logger.log('✅ ShipmentsService inizializzato');
  }

  // ===========================
  // 📦 SHIPMENT CREATION (BRT)
  // ===========================
  /**
   * ✅ NUOVO: Crea shipment con ordine già caricato (per webhooks)
   * Usato dal webhook per evitare race conditions
   */
  async createShipmentWithOrder(
    order: Order,
    transactionManager?: EntityManager,
    options?: { generateLabel?: boolean; notes?: string },
  ): Promise<BrtShipmentResponseDto> {
    const executeInTransaction = async (manager: EntityManager) => {
      this.logger.log(`📦 [CREATE SHIPMENT] START - Order: ${order.orderNumber} (${order.id})`);
      this.logger.log(`📊 Order status: ${order.status}`);

      // ✅ Verifica stato (dovrebbe essere CONFIRMED)
      if (order.status !== OrderStatus.CONFIRMED) {
        this.logger.error(
          `❌ [CREATE SHIPMENT] Invalid status: ${order.status} (expected: CONFIRMED)`,
        );
        throw new BadRequestException(
          `Ordine ${order.orderNumber} deve essere CONFIRMED per creare spedizione (attuale: ${order.status})`,
        );
      }

      // ✅ VALIDAZIONE SHIPPING ADDRESS
      if (!order.shippingAddress) {
        this.logger.error(
          `❌ [CREATE SHIPMENT] Missing shipping address for order ${order.orderNumber}`,
        );
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non ha indirizzo di spedizione`,
        );
      }

      const addr = order.shippingAddress as {
        name: string;
        street: string;
        city: string;
        postalCode: string;
        province?: string;
        country: string;
        phone?: string;
      };

      if (!addr.name || !addr.street || !addr.city || !addr.postalCode || !addr.country) {
        this.logger.error(
          `❌ [CREATE SHIPMENT] Incomplete shipping address for order ${order.orderNumber}`,
        );
        throw new BadRequestException(
          `Indirizzo di spedizione incompleto per ordine ${order.orderNumber}`,
        );
      }

      // ✅ Verifica spedizione esistente
      if (order.brtShipmentId) {
        this.logger.warn(
          `⚠️ Order ${order.orderNumber} already has BRT shipment: ${order.brtShipmentId}`,
        );

        const existingShipment = await manager.findOne(Shipment, {
          where: { orderId: order.id },
        });

        if (existingShipment) {
          return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            trackingNumber: order.brtTrackingNumber || '',
            parcelID: order.brtShipmentId,
            brtShipmentNumber: order.brtShipmentId,
            status: existingShipment.status,
            arrivalDepot: '',
            deliveryZone: '',
            numberOfParcels: 1,
            weightKG: 0,
            labelUrl: existingShipment.labelFilePath,
            isConfirmed: false,
            createdAt: existingShipment.createdAt,
          };
        }
      }

      // ✅ Crea spedizione BRT
      this.logger.log(`🚀 Calling BRT API...`);

      const createDto: CreateBrtShipmentDto = {
        orderId: order.id,
        generateLabel: options?.generateLabel ?? true,
        notes: options?.notes,
      };

      const brtResponse = await this.brtService.createShipment(order, createDto);

      // ✅ Verifica risposta
      if (!brtResponse.createResponse || brtResponse.createResponse.executionMessage.code < 0) {
        const errMsg = brtResponse.createResponse?.executionMessage?.message || 'Errore BRT';
        this.logger.error(`❌ [CREATE SHIPMENT] BRT API error: ${errMsg}`);
        throw new BadRequestException(errMsg);
      }

      const createData = brtResponse.createResponse;
      const firstLabel: BrtLabel | undefined = createData.labels?.label?.[0];
      const labelBase64 = firstLabel?.stream;
      const parcelID = firstLabel?.parcelID || '';
      const trackingNumber = firstLabel?.trackingByParcelID || '';

      this.logger.log(`✅ BRT API success - Tracking: ${trackingNumber}`);

      // ✅ Upload etichetta S3
      let labelUrl: string | undefined;

      if (labelBase64) {
        try {
          this.logger.log(`📤 Uploading label to S3...`);

          labelUrl = await this.s3Service.uploadBrtLabel(
            labelBase64,
            order.orderNumber,
            parcelID,
          );

          this.logger.log(`✅ Label uploaded: ${labelUrl}`);
        } catch (s3Error: any) {
          this.logger.error(`❌ S3 upload error: ${s3Error.message}`);
          labelUrl = undefined;
        }
      }

      // ✅ Salva Shipment
      const shipment = manager.create(Shipment, {
        orderId: order.id,
        carrier: 'BRT',
        trackingCode: trackingNumber,
        status: ShipmentStatus.CREATED,
        labelFilePath: labelUrl,
        labelDownloaded: false,
        providerMetadata: {
          provider: 'BRT',
          brtShipmentNumber: `${createData.departureDepot}-${createData.seriesNumber}`,
          brtParcelId: parcelID,
          arrivalDepot: createData.arrivalDepot,
          deliveryZone: createData.deliveryZone,
          arrivalTerminal: createData.arrivalTerminal,
          createdAt: new Date().toISOString(),
        },
      });

      await manager.save(Shipment, shipment);

      // ✅ Aggiorna Order
      await manager.update(Order, order.id, {
        brtShipmentId: parcelID,
        brtTrackingNumber: trackingNumber,
        brtShipmentData: createData as any,
        status: OrderStatus.READY_TO_SHIP,
      });

      this.logger.log(
        `✅ [CREATE SHIPMENT] SUCCESS - Order: ${order.orderNumber} → Tracking: ${trackingNumber}`,
      );

      // ✅ Emit evento
      this.eventEmitter.emit('shipment.created', {
        order,
        shipment,
        trackingNumber,
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        trackingNumber,
        parcelID,
        brtShipmentNumber: `${createData.departureDepot}-${createData.seriesNumber}`,
        status: ShipmentStatus.CREATED,
        arrivalDepot: createData.arrivalDepot,
        deliveryZone: createData.deliveryZone,
        numberOfParcels: createData.numberOfParcels,
        weightKG: createData.weightKG,
        labelUrl,
        isConfirmed: false,
        createdAt: new Date(),
      };
    };

    // ✅ Usa transaction manager se fornito, altrimenti crea nuova transaction
    if (transactionManager) {
      return executeInTransaction(transactionManager);
    } else {
      return this.dataSource.transaction(executeInTransaction);
    }
  }
  /**
   * Crea spedizione BRT per ordine
   * - Verifica stato ordine (CONFIRMED)
   * - Chiama BRT API Create
   * - Salva etichetta su S3
   * - Aggiorna Order → READY_TO_SHIP
   * - NON conferma (modalità esplicita)
   */
  async createShipmentForOrder(
    orderId: string,
    options?: { generateLabel?: boolean; notes?: string },
  ): Promise<BrtShipmentResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`📦 [CREATE SHIPMENT] START - Order ID: ${orderId}`);

      try {
        // 1. ✅ Carica ordine (senza lock pessimistico che causa problemi con LEFT JOIN)
        const order = await manager.findOne(Order, {
          where: { id: orderId },
          relations: ['items', 'items.variant', 'user'],
        });

        if (!order) {
          this.logger.error(`❌ [CREATE SHIPMENT] Order ${orderId} not found`);
          throw new NotFoundException(`Ordine ${orderId} non trovato`);
        }

        // 2. Log dettagli ordine
        this.logger.log(`📊 Order details:`);
        this.logger.log(`   ├─ Number: ${order.orderNumber}`);
        this.logger.log(`   ├─ Status: ${order.status}`);
        this.logger.log(`   ├─ Total: €${order.total}`);
        this.logger.log(`   ├─ Items: ${order.items?.length || 0}`);
        this.logger.log(`   └─ Customer: ${order.customerEmail || order.user?.email || 'N/A'}`);

        // 3. Verifica stato ordine (accetta CONFIRMED o PROCESSING)
        if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PROCESSING) {
          this.logger.error(
            `❌ [CREATE SHIPMENT] Invalid status: ${order.status} (expected: CONFIRMED or PROCESSING)`,
          );
          throw new BadRequestException(
            `Ordine ${order.orderNumber} deve essere CONFIRMED o PROCESSING per creare spedizione (attuale: ${order.status})`,
          );
        }

        // 4. VALIDAZIONE SHIPPING ADDRESS (campo JSON)
        if (!order.shippingAddress) {
          this.logger.error(
            `❌ [CREATE SHIPMENT] Missing shipping address for order ${order.orderNumber}`,
          );
          throw new BadRequestException(
            `Ordine ${order.orderNumber} non ha indirizzo di spedizione`,
          );
        }

        // 5. Cast e validazione campi obbligatori BRT
        const addr = order.shippingAddress as {
          name: string;
          street: string;
          city: string;
          postalCode: string;
          province?: string;
          country: string;
          phone?: string;
        };

        this.logger.log(`📍 Shipping address:`);
        this.logger.log(`   ├─ Name: ${addr.name}`);
        this.logger.log(`   ├─ Street: ${addr.street}`);
        this.logger.log(`   ├─ City: ${addr.city} (${addr.postalCode})`);
        this.logger.log(`   ├─ Province: ${addr.province || 'N/A'}`);
        this.logger.log(`   ├─ Country: ${addr.country}`);
        this.logger.log(`   └─ Phone: ${addr.phone || 'N/A'}`);

        if (!addr.name || !addr.street || !addr.city || !addr.postalCode || !addr.country) {
          this.logger.error(
            `❌ [CREATE SHIPMENT] Incomplete shipping address for order ${order.orderNumber}`,
          );
          throw new BadRequestException(
            `Indirizzo di spedizione incompleto per ordine ${order.orderNumber}. ` +
            `Campi richiesti: name, street, city, postalCode, country`,
          );
        }

        // 6. Verifica se esiste già spedizione
        if (order.brtShipmentId) {
          this.logger.warn(
            `⚠️ Order ${order.orderNumber} already has BRT shipment: ${order.brtShipmentId}`,
          );

          const existingShipment = await manager.findOne(Shipment, {
            where: { orderId: order.id },
          });

          if (existingShipment) {
            return {
              orderId: order.id,
              orderNumber: order.orderNumber,
              trackingNumber: order.brtTrackingNumber || '',
              parcelID: order.brtShipmentId,
              brtShipmentNumber: order.brtShipmentId,
              status: existingShipment.status,
              arrivalDepot: '',
              deliveryZone: '',
              numberOfParcels: 1,
              weightKG: 0,
              labelUrl: existingShipment.labelFilePath,
              isConfirmed: false,
              createdAt: existingShipment.createdAt,
            };
          }
        }

        // 7. Crea spedizione BRT
        this.logger.log(`🚀 Calling BRT API...`);

        const createDto: CreateBrtShipmentDto = {
          orderId: order.id,
          generateLabel: options?.generateLabel ?? true,
          notes: options?.notes,
        };

        const brtResponse = await this.brtService.createShipment(order, createDto);

        // 8. Verifica risposta BRT
        if (!brtResponse.createResponse || brtResponse.createResponse.executionMessage.code < 0) {
          const errMsg = brtResponse.createResponse?.executionMessage?.message || 'Errore creazione spedizione BRT';
          this.logger.error(`❌ [CREATE SHIPMENT] BRT API error: ${errMsg}`);
          throw new BadRequestException(errMsg);
        }

        const createData = brtResponse.createResponse;
        const executionMsg = createData.executionMessage;

        this.logger.log(`✅ BRT API call completed`);
        this.logger.log(`   ├─ Code: ${executionMsg.code}`);
        this.logger.log(`   ├─ Message: ${executionMsg.message}`);
        this.logger.log(`   └─ Description: ${executionMsg.codeDesc || 'N/A'}`);

        // 9. Estrai etichetta
        const firstLabel: BrtLabel | undefined = createData.labels?.label?.[0];
        const labelBase64 = firstLabel?.stream;
        const parcelID = firstLabel?.parcelID || '';
        const trackingNumber = firstLabel?.trackingByParcelID || '';

        this.logger.log(`📦 Shipment created:`);
        this.logger.log(`   ├─ ParcelID: ${parcelID}`);
        this.logger.log(`   ├─ Tracking: ${trackingNumber}`);
        this.logger.log(`   └─ Label: ${labelBase64 ? `${Math.round(labelBase64.length / 1024)} KB` : 'N/A'}`);

        // 10. ✅ Salva etichetta su S3
        let labelUrl: string | undefined;

        if (labelBase64) {
          try {
            this.logger.log(`📤 Uploading label to S3...`);

            labelUrl = await this.s3Service.uploadBrtLabel(
              labelBase64,
              order.orderNumber,
              parcelID,
            );

            this.logger.log(`✅ Label uploaded to S3: ${labelUrl}`);
          } catch (s3Error: any) {
            this.logger.error(`❌ S3 upload error: ${s3Error.message}`);
            this.logger.error(`   Stack: ${s3Error.stack}`);
            // NON bloccare il flusso se S3 fallisce
            labelUrl = undefined;
          }
        } else {
          this.logger.warn(`⚠️ No label received from BRT API`);
        }

        // 11. Warnings (se presenti)
        let warningMessage: string | undefined;
        if (executionMsg.code > 0 && executionMsg.code <= 7) {
          warningMessage = `[CODE ${executionMsg.code}] ${executionMsg.message}`;
          this.logger.warn(`⚠️ BRT Warning: ${warningMessage}`);
        }

        // 12. Salva Shipment entity
        this.logger.log(`💾 Saving shipment to database...`);

        const shipment = manager.create(Shipment, {
          orderId: order.id,
          carrier: 'BRT',
          trackingCode: trackingNumber,
          status: ShipmentStatus.CREATED,
          labelFilePath: labelUrl,
          labelDownloaded: false,
          providerMetadata: {
            provider: 'BRT',
            brtShipmentNumber: `${createData.departureDepot}-${createData.seriesNumber}`,
            brtParcelId: parcelID,
            arrivalDepot: createData.arrivalDepot,
            deliveryZone: createData.deliveryZone,
            arrivalTerminal: createData.arrivalTerminal,
            createdAt: new Date().toISOString(),
          },
        });

        await manager.save(Shipment, shipment);

        // 13. Aggiorna Order
        await manager.update(Order, order.id, {
          brtShipmentId: parcelID,
          brtTrackingNumber: trackingNumber,
          brtShipmentData: createData as any,
          status: OrderStatus.READY_TO_SHIP,
        });

        this.logger.log(
          `✅ [CREATE SHIPMENT] SUCCESS - Order: ${order.orderNumber} → Tracking: ${trackingNumber}`,
        );

        // 14. Emit evento
        this.eventEmitter.emit('shipment.created', {
          order,
          shipment,
          trackingNumber,
        });

        // 15. Return DTO
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          trackingNumber,
          parcelID,
          brtShipmentNumber: `${createData.departureDepot}-${createData.seriesNumber}`,
          status: ShipmentStatus.CREATED,
          arrivalDepot: createData.arrivalDepot,
          deliveryZone: createData.deliveryZone,
          numberOfParcels: createData.numberOfParcels,
          weightKG: createData.weightKG,
          labelUrl,
          isConfirmed: false,
          createdAt: new Date(),
          warning: warningMessage,
        };
      } catch (error: any) {
        this.logger.error(`❌ [CREATE SHIPMENT] ERROR - Order ${orderId}`);
        this.logger.error(`   ├─ Message: ${error.message}`);
        this.logger.error(`   └─ Stack: ${error.stack}`);
        throw error;
      }
    });
  }

  /**
   * Bulk create shipments per ordini multipli
   */
  async bulkCreateShipments(orderIds: string[]): Promise<{
    success: number;
    failed: number;
    results: Array<{
      orderId: string;
      orderNumber: string;
      success: boolean;
      trackingNumber?: string;
      error?: string;
    }>;
  }> {
    this.logger.log(`📦 [BULK CREATE] START - Processing ${orderIds.length} orders`);

    const results: Array<{
      orderId: string;
      orderNumber: string;
      success: boolean;
      trackingNumber?: string;
      error?: string;
    }> = [];

    let success = 0;
    let failed = 0;

    for (const orderId of orderIds) {
      try {
        const order = await this.orderRepository.findOne({
          where: { id: orderId },
          select: ['id', 'orderNumber'],
        });

        if (!order) {
          results.push({
            orderId,
            orderNumber: 'UNKNOWN',
            success: false,
            error: 'Ordine non trovato',
          });
          failed++;
          continue;
        }

        const response = await this.createShipmentForOrder(orderId);

        results.push({
          orderId,
          orderNumber: order.orderNumber,
          success: true,
          trackingNumber: response.trackingNumber,
        });

        success++;
      } catch (error: any) {
        this.logger.error(`❌ [BULK CREATE] Error for order ${orderId}: ${error.message}`);

        const order = await this.orderRepository.findOne({
          where: { id: orderId },
          select: ['orderNumber'],
        });

        results.push({
          orderId,
          orderNumber: order?.orderNumber || 'UNKNOWN',
          success: false,
          error: error.message,
        });

        failed++;
      }
    }

    this.logger.log(
      `✅ [BULK CREATE] COMPLETED - Success: ${success}, Failed: ${failed}`,
    );

    return { success, failed, results };
  }

  // ===========================
  // ✅ SHIPMENT CONFIRMATION (BRT)
  // ===========================

  /**
   * Conferma spedizione BRT dopo ritiro corriere
   */
  async confirmShipment(
    orderId: string,
    dto?: ConfirmBrtShipmentDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`✅ [CONFIRM SHIPMENT] START - Order ID: ${orderId}`);

      // 1. Carica ordine
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['user'],
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      this.logger.log(`   ├─ Order: ${order.orderNumber}`);
      this.logger.log(`   ├─ Status: ${order.status}`);
      this.logger.log(`   └─ Tracking: ${order.brtTrackingNumber || 'N/A'}`);

      // 2. Verifica stato
      if (order.status !== OrderStatus.READY_TO_SHIP) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} deve essere READY_TO_SHIP per confermare (attuale: ${order.status})`,
        );
      }

      if (!order.brtShipmentId) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non ha spedizione BRT creata`,
        );
      }

      // 3. Conferma BRT API
      const confirmResponse = await this.brtService.confirmShipment(order);

      // Verifica risposta
      if (!confirmResponse.confirmResponse || confirmResponse.confirmResponse.executionMessage.code < 0) {
        const errMsg = confirmResponse.confirmResponse?.executionMessage?.message || 'Errore conferma BRT';
        throw new BadRequestException(errMsg);
      }

      // 4. Aggiorna Order
      await manager.update(Order, order.id, {
        status: OrderStatus.SHIPPED,
        updatedAt: new Date(),
      });

      // 5. Aggiorna Shipment
      await manager.update(
        Shipment,
        { orderId: order.id },
        {
          status: ShipmentStatus.SHIPPED,
          updatedAt: new Date(),
        },
      );

      this.logger.log(
        `✅ [CONFIRM SHIPMENT] SUCCESS - Order: ${order.orderNumber}`,
      );

      // 6. Invia email spedizione
      try {
        await this.sendShippedEmail(order);
      } catch (emailError: any) {
        this.logger.error(`❌ Email error: ${emailError.message}`);
      }

      // 7. Emit evento
      this.eventEmitter.emit('shipment.confirmed', {
        order,
        trackingNumber: order.brtTrackingNumber,
      });

      return {
        success: true,
        message: `Spedizione confermata per ordine ${order.orderNumber}`,
      };
    });
  }

  /**
   * Bulk confirm shipments
   */
  async bulkConfirmShipments(
    dto: BulkConfirmBrtShipmentsDto,
  ): Promise<{
    success: number;
    failed: number;
    results: Array<{
      orderId: string;
      orderNumber: string;
      success: boolean;
      message?: string;
    }>;
  }> {
    this.logger.log(`✅ [BULK CONFIRM] START - Processing ${dto.orderIds.length} orders`);

    const results: Array<{
      orderId: string;
      orderNumber: string;
      success: boolean;
      message?: string;
    }> = [];

    let success = 0;
    let failed = 0;

    for (const orderId of dto.orderIds) {
      try {
        const order = await this.orderRepository.findOne({
          where: { id: orderId },
          select: ['id', 'orderNumber'],
        });

        if (!order) {
          results.push({
            orderId,
            orderNumber: 'UNKNOWN',
            success: false,
            message: 'Ordine non trovato',
          });
          failed++;
          continue;
        }

        const response = await this.confirmShipment(orderId);

        results.push({
          orderId,
          orderNumber: order.orderNumber,
          success: true,
          message: response.message,
        });

        success++;
      } catch (error: any) {
        this.logger.error(`❌ [BULK CONFIRM] Error for order ${orderId}: ${error.message}`);

        const order = await this.orderRepository.findOne({
          where: { id: orderId },
          select: ['orderNumber'],
        });

        results.push({
          orderId,
          orderNumber: order?.orderNumber || 'UNKNOWN',
          success: false,
          message: error.message,
        });

        failed++;
      }
    }

    this.logger.log(
      `✅ [BULK CONFIRM] COMPLETED - Success: ${success}, Failed: ${failed}`,
    );

    return { success, failed, results };
  }

  // ===========================
  // 🗑️ SHIPMENT DELETION (BRT)
  // ===========================

  /**
   * Cancella spedizione BRT (solo pre-ritiro)
   */
  async deleteShipment(
    orderId: string,
    dto: DeleteBrtShipmentDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`🗑️ [DELETE SHIPMENT] START - Order ID: ${orderId}`);

      // 1. Carica ordine
      const order = await manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }

      this.logger.log(`   ├─ Order: ${order.orderNumber}`);
      this.logger.log(`   ├─ Status: ${order.status}`);
      this.logger.log(`   └─ Reason: ${dto.reason || 'N/A'}`);

      // 2. Verifica stato (solo READY_TO_SHIP)
      if (order.status !== OrderStatus.READY_TO_SHIP) {
        throw new BadRequestException(
          `Impossibile cancellare spedizione: ordine ${order.orderNumber} in stato ${order.status}. ` +
          `Solo ordini READY_TO_SHIP possono essere cancellati.`,
        );
      }

      if (!order.brtShipmentId) {
        throw new BadRequestException(
          `Ordine ${order.orderNumber} non ha spedizione BRT da cancellare`,
        );
      }

      // 3. Cancella BRT API
      const deleteResponse = await this.brtService.deleteShipment(order, dto.reason);

      // Verifica risposta
      if (!deleteResponse.deleteResponse || deleteResponse.deleteResponse.executionMessage.code < 0) {
        const errMsg = deleteResponse.deleteResponse?.executionMessage?.message || 'Errore cancellazione BRT';
        throw new BadRequestException(errMsg);
      }

      // 4. Cancella Shipment entity
      await manager.delete(Shipment, { orderId: order.id });

      // 5. Aggiorna Order (reset BRT data)
      const updateData: any = {
        brtShipmentId: null,
        brtTrackingNumber: null,
        status: OrderStatus.CONFIRMED,
        notes: (order.notes || '') + `\n[${new Date().toISOString()}] Spedizione cancellata: ${dto.reason || 'N/A'}`,
      };

      // Gestione brtShipmentData che potrebbe non accettare null
      if (order.brtShipmentData !== undefined) {
        updateData.brtShipmentData = {} as any;
      }

      await manager.update(Order, order.id, updateData);

      this.logger.log(
        `✅ [DELETE SHIPMENT] SUCCESS - Order: ${order.orderNumber}`,
      );

      // 6. Emit evento
      this.eventEmitter.emit('shipment.deleted', {
        order,
        reason: dto.reason,
      });

      return {
        success: true,
        message: `Spedizione cancellata per ordine ${order.orderNumber}. Puoi ricrearla.`,
      };
    });
  }

  // ===========================
  // 📊 TRACKING & QUERIES
  // ===========================

  /**
   * Ottieni info tracking BRT per ordine
   */
  async getTracking(dto: TrackBrtShipmentDto): Promise<BrtTrackingInfoDto> {
    const { orderId, trackingNumber } = dto;

    // Verifica che almeno uno sia presente
    if (!orderId && !trackingNumber) {
      throw new BadRequestException('Fornire orderId o trackingNumber');
    }

    // 1. Cerca ordine
    let order: Order | null = null;

    if (orderId) {
      order = await this.orderRepository.findOne({
        where: { id: orderId },
        select: ['id', 'orderNumber', 'brtTrackingNumber', 'status'],
      });

      if (!order) {
        throw new NotFoundException(`Ordine ${orderId} non trovato`);
      }
    } else if (trackingNumber) {
      order = await this.orderRepository.findOne({
        where: { brtTrackingNumber: trackingNumber },
        select: ['id', 'orderNumber', 'brtTrackingNumber', 'status'],
      });

      if (!order) {
        throw new NotFoundException(
          `Ordine con tracking ${trackingNumber} non trovato`,
        );
      }
    }

    const trackingCode = order!.brtTrackingNumber;

    if (!trackingCode) {
      throw new BadRequestException(
        `Ordine ${order!.orderNumber} non ha tracking number BRT`,
      );
    }

    // 2. Chiama BRT API Tracking
    const trackingResponse = await this.brtService.getTracking(trackingCode);

    // Verifica risposta
    if (!trackingResponse.ttParcelIdResponse || !trackingResponse.ttParcelIdResponse.spedizione) {
      throw new BadRequestException('Nessuna informazione di tracking disponibile');
    }

    const spedizione = trackingResponse.ttParcelIdResponse.spedizione;
    const datiSpedizione = spedizione.dati_spedizione;

    // 3. Map response to DTO
    return {
      trackingNumber: trackingCode,
      currentStatus: this.extractCurrentStatus(spedizione.eventi),
      lastUpdate: this.parseLastEventDate(spedizione.eventi),
      estimatedDeliveryDate: undefined, // BRT non fornisce questa info
      deliveredAt: this.extractDeliveryDate(spedizione.eventi),
      events: (spedizione.eventi || []).map(evento => ({
        date: evento.data,
        time: evento.ora,
        description: evento.descrizione,
        location: evento.localita,
      })),
      notes: spedizione.note?.map(nota => nota.testo),
      consignee: {
        name: datiSpedizione.destinatario,
        address: datiSpedizione.indirizzo,
        city: datiSpedizione.localita,
        zipCode: datiSpedizione.cap,
        province: datiSpedizione.provincia,
      },
    };
  }

  /**
   * Ottieni ordini READY_TO_SHIP (da confermare)
   */
  async getReadyToShipOrders(filters?: GetReadyToShipDto): Promise<Order[]> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('order.user', 'user')
      .where('order.status = :status', { status: OrderStatus.READY_TO_SHIP })
      .andWhere('order.brtShipmentId IS NOT NULL')
      .orderBy('order.createdAt', 'ASC');

    if (filters?.startDate) {
      query.andWhere('order.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }

    if (filters?.endDate) {
      query.andWhere('order.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    if (filters?.limit) {
      query.take(filters.limit);
    } else {
      query.take(100); // Default limit
    }

    return query.getMany();
  }

  /**
   * Ottieni ordini confermati ma senza spedizione (da creare)
   */
  async getOrdersNeedingShipment(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<Order[]> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .where('order.status = :status', { status: OrderStatus.CONFIRMED })
      .andWhere('order.brtShipmentId IS NULL')
      .orderBy('order.createdAt', 'ASC');

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

    return query.getMany();
  }

  /**
   * Download etichetta da S3
   */
  async downloadLabel(orderId: string): Promise<string> {
    const shipment = await this.shipmentRepository.findOne({
      where: { orderId },
    });

    if (!shipment || !shipment.labelFilePath) {
      throw new NotFoundException('Etichetta non trovata');
    }

    // Genera URL firmato (valido 1 ora)
    return this.s3Service.getSignedDownloadUrl(shipment.labelFilePath);
  }

  // ===========================
  // 🔄 TRACKING UPDATE (CRON)
  // ===========================

  /**
   * Aggiorna tracking ordini spediti (chiamato da cron)
   */
  async updateShipmentsTracking(): Promise<{
    updated: number;
    unchanged: number;
    errors: number;
  }> {
    this.logger.log('🔄 [UPDATE TRACKING] START');

    const ordersToUpdate = await this.orderRepository.find({
      where: [
        { status: OrderStatus.SHIPPED },
        { status: OrderStatus.IN_TRANSIT },
        { status: OrderStatus.OUT_FOR_DELIVERY },
      ],
      relations: ['user'],
      take: 100,
    });

    if (ordersToUpdate.length === 0) {
      this.logger.log('✅ [UPDATE TRACKING] No orders to update');
      return { updated: 0, unchanged: 0, errors: 0 };
    }

    this.logger.log(
      `🔄 [UPDATE TRACKING] Processing ${ordersToUpdate.length} orders`,
    );

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    for (const order of ordersToUpdate) {
      try {
        if (!order.brtTrackingNumber) {
          unchanged++;
          continue;
        }

        // Ottieni tracking
        const trackingResponse = await this.brtService.getTracking(
          order.brtTrackingNumber,
        );

        // Verifica risposta
        if (!trackingResponse.ttParcelIdResponse || !trackingResponse.ttParcelIdResponse.spedizione) {
          unchanged++;
          continue;
        }

        const spedizione = trackingResponse.ttParcelIdResponse.spedizione;

        // Determina nuovo stato
        const currentStatus = this.extractCurrentStatus(spedizione.eventi);
        const newStatus = this.mapTrackingToOrderStatus(currentStatus);

        // Se stato cambiato, aggiorna
        if (newStatus && newStatus !== order.status) {
          await this.orderRepository.update(order.id, {
            status: newStatus,
            updatedAt: new Date(),
          });

          await this.shipmentRepository.update(
            { orderId: order.id },
            {
              trackingEvents: (spedizione.eventi || []).map(e => ({
                date: e.data,
                time: e.ora,
                description: e.descrizione,
                location: e.localita,
              })) as any,
              status: this.mapOrderStatusToShipmentStatus(newStatus),
              updatedAt: new Date(),
            },
          );

          this.logger.log(
            `   ├─ Updated: ${order.orderNumber} ${order.status} → ${newStatus}`,
          );

          // Invia notifiche su milestone importanti
          await this.sendTrackingMilestoneNotification(order, newStatus);

          updated++;
        } else {
          unchanged++;
        }
      } catch (error: any) {
        this.logger.error(
          `❌ [UPDATE TRACKING] Error for ${order.orderNumber}: ${error.message}`,
        );
        errors++;
      }
    }

    this.logger.log(
      `✅ [UPDATE TRACKING] COMPLETED - Updated: ${updated}, Unchanged: ${unchanged}, Errors: ${errors}`,
    );

    return { updated, unchanged, errors };
  }

  // ===========================
  // 🛠️ PRIVATE HELPERS
  // ===========================

  private extractCurrentStatus(eventi?: any[]): string {
    if (!eventi || eventi.length === 0) {
      return 'IN_TRANSIT';
    }

    const lastEvent = eventi[eventi.length - 1];
    const description = lastEvent.descrizione?.toUpperCase() || '';

    if (description.includes('CONSEGNAT')) {
      return 'DELIVERED';
    } else if (description.includes('IN CONSEGNA') || description.includes('USCITA PER')) {
      return 'OUT_FOR_DELIVERY';
    } else {
      return 'IN_TRANSIT';
    }
  }

  private parseLastEventDate(eventi?: any[]): Date {
    if (!eventi || eventi.length === 0) {
      return new Date();
    }

    const lastEvent = eventi[eventi.length - 1];
    const dateStr = lastEvent.data; // formato yyyy-MM-dd
    const timeStr = lastEvent.ora || '00:00:00'; // formato HH:mm:ss

    return new Date(`${dateStr}T${timeStr}`);
  }

  private extractDeliveryDate(eventi?: any[]): Date | undefined {
    if (!eventi || eventi.length === 0) {
      return undefined;
    }

    const deliveryEvent = eventi.find(e =>
      e.descrizione?.toUpperCase().includes('CONSEGNAT')
    );

    if (!deliveryEvent) {
      return undefined;
    }

    const dateStr = deliveryEvent.data;
    const timeStr = deliveryEvent.ora || '00:00:00';

    return new Date(`${dateStr}T${timeStr}`);
  }

  private mapTrackingToOrderStatus(
    trackingStatus: string,
  ): OrderStatus | null {
    const statusMap: Record<string, OrderStatus> = {
      'IN_TRANSIT': OrderStatus.IN_TRANSIT,
      'IN TRANSITO': OrderStatus.IN_TRANSIT,
      'OUT_FOR_DELIVERY': OrderStatus.OUT_FOR_DELIVERY,
      'IN CONSEGNA': OrderStatus.OUT_FOR_DELIVERY,
      'DELIVERED': OrderStatus.DELIVERED,
      'CONSEGNATO': OrderStatus.DELIVERED,
    };

    return statusMap[trackingStatus.toUpperCase()] || null;
  }

  private mapOrderStatusToShipmentStatus(
    orderStatus: OrderStatus,
  ): ShipmentStatus {
    const statusMap: Record<OrderStatus, ShipmentStatus> = {
      [OrderStatus.SHIPPED]: ShipmentStatus.SHIPPED,
      [OrderStatus.IN_TRANSIT]: ShipmentStatus.IN_TRANSIT,
      [OrderStatus.OUT_FOR_DELIVERY]: ShipmentStatus.OUT_FOR_DELIVERY,
      [OrderStatus.DELIVERED]: ShipmentStatus.DELIVERED,
      [OrderStatus.CONFIRMED]: ShipmentStatus.CREATED,
      [OrderStatus.READY_TO_SHIP]: ShipmentStatus.CREATED,
      [OrderStatus.PENDING]: ShipmentStatus.CREATED,
      [OrderStatus.PROCESSING]: ShipmentStatus.CREATED,
      [OrderStatus.CANCELLED]: ShipmentStatus.EXCEPTION,
      [OrderStatus.REFUNDED]: ShipmentStatus.EXCEPTION,
    };

    return statusMap[orderStatus] || ShipmentStatus.CREATED;
  }

  private async sendTrackingMilestoneNotification(
    order: Order,
    newStatus: OrderStatus,
  ): Promise<void> {
    try {
      // Invia email solo su milestone importanti
      const milestones = [
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
      ];

      if (!milestones.includes(newStatus)) {
        return;
      }

      const customerEmail = order.customerEmail || order.user?.email;

      if (!customerEmail) {
        this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
        return;
      }

      if (newStatus === OrderStatus.OUT_FOR_DELIVERY) {
        this.logger.log(`📧 [EMAIL] OUT_FOR_DELIVERY for ${order.orderNumber} → ${customerEmail}`);
        // TODO: Implementare con NotificationsService
        // await this.notificationsService.sendOutForDeliveryEmail(order);
      } else if (newStatus === OrderStatus.DELIVERED) {
        this.logger.log(`📧 [EMAIL] DELIVERED for ${order.orderNumber} → ${customerEmail}`);
        // TODO: Implementare con NotificationsService
        // await this.notificationsService.sendDeliveredEmail(order);
      }
    } catch (error: any) {
      this.logger.error(`❌ Notification error: ${error.message}`);
    }
  }

  private async sendShippedEmail(order: Order): Promise<void> {
    const customerEmail = order.customerEmail || order.user?.email;

    if (!customerEmail) {
      this.logger.warn(`⚠️ No email for order ${order.orderNumber}`);
      return;
    }

    this.logger.log(`📧 [EMAIL] SHIPPED for ${order.orderNumber} → ${customerEmail}`);

    // TODO: Implementare con NotificationsService
    // await this.notificationsService.sendShippedEmail(order);
  }
}