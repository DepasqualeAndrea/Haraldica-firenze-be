// src/modules/public-api/brt/brt.service.ts

import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Order, OrderStatus } from '../../../database/entities/order.entity';
import { BrtCreateShipmentResponse, BrtCreateShipmentRequest, BrtConfirmShipmentResponse, BrtConfirmShipmentRequest, BrtDeleteShipmentResponse, BrtDeleteShipmentRequest, BrtErrorCode, BrtTrackingResponse, BrtTrackingByParcelIDRequest } from './interface/brt-api.interface';

@Injectable()
export class BrtService {
  private readonly logger = new Logger(BrtService.name);
  private readonly apiUrl: string;
  private readonly userID: string;
  private readonly password: string;
  private readonly departureDepot: number;
  private readonly senderCustomerCode: number;
  private readonly pricingConditionCode: string;
  private readonly deliveryFreightType: 'DAP' | 'EXW';
  private readonly autoConfirm: boolean;

  // Warehouse (mittente)
  private readonly warehouseName: string;
  private readonly warehouseCompany: string;
  private readonly warehouseStreet: string;
  private readonly warehouseCity: string;
  private readonly warehousePostalCode: string;
  private readonly warehouseProvince: string;
  private readonly warehouseCountry: string;
  private readonly warehousePhone: string;
  private readonly warehouseEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    // BRT Config
    this.apiUrl = this.configService.get<string>('BRT_API_URL') ?? '';
    this.userID = this.configService.get<string>('BRT_USER_ID') ?? '';
    this.password = this.configService.get<string>('BRT_PASSWORD') ?? '';
    this.departureDepot = parseInt(this.configService.get<string>('BRT_DEPARTURE_DEPOT') ?? '0', 10);
    this.senderCustomerCode = parseInt(this.configService.get<string>('BRT_SENDER_CUSTOMER_CODE') ?? '0', 10);
    // ✅ FIX: Default "000" per test, poi cambierà in produzione
    this.pricingConditionCode = this.configService.get<string>('BRT_PRICING_CONDITION_CODE', '000');
    this.deliveryFreightType = this.configService.get<'DAP' | 'EXW'>('BRT_DELIVERY_FREIGHT_TYPE', 'DAP');
    this.autoConfirm = this.configService.get<string>('BRT_AUTO_CONFIRM', 'false') === 'true';

    // Warehouse Config
    this.warehouseName = this.configService.get<string>('WAREHOUSE_NAME') ?? '';
    this.warehouseCompany = this.configService.get<string>('WAREHOUSE_COMPANY_NAME', this.warehouseName) ?? this.warehouseName;
    this.warehouseStreet = this.configService.get<string>('WAREHOUSE_STREET') ?? '';
    this.warehouseCity = this.configService.get<string>('WAREHOUSE_CITY') ?? '';
    this.warehousePostalCode = this.configService.get<string>('WAREHOUSE_POSTAL_CODE') ?? '';
    this.warehouseProvince = this.configService.get<string>('WAREHOUSE_PROVINCE') ?? '';
    this.warehouseCountry = this.configService.get<string>('WAREHOUSE_COUNTRY', 'IT') ?? 'IT';
    this.warehousePhone = this.configService.get<string>('WAREHOUSE_PHONE') ?? '';
    this.warehouseEmail = this.configService.get<string>('WAREHOUSE_EMAIL') ?? '';

    this.logger.log('🚚 BRT Service initialized');
    this.logger.log(`📍 Warehouse: ${this.warehouseCity} (${this.warehouseProvince})`);
    this.logger.log(`🏢 Departure Depot: ${this.departureDepot}`);
    this.logger.log(`💰 Pricing Condition: ${this.pricingConditionCode}`);
    this.logger.log(`✅ Auto-confirm: ${this.autoConfirm ? 'YES' : 'NO (Manual)'}`);
  }

  /**
   * ==========================================
   * CREATE SHIPMENT
   * ==========================================
   * Crea una spedizione BRT dall'ordine
   * NOTA: Con conferma esplicita, la spedizione NON è ancora confermata
   */
  async createShipment(
    order: Order,
    options: {
      generateLabel?: boolean;
      serviceType?: '' | 'E' | 'H';
      weightKG?: number;
      numberOfParcels?: number;
      notes?: string;
    } = {},
  ): Promise<BrtCreateShipmentResponse> {
    const startTime = Date.now();

    this.logger.log(`📦 [CREATE SHIPMENT] START - Order: ${order.orderNumber} (${order.id})`);

    // ✅ VALIDAZIONE: shippingAddress è un campo JSON, non una relazione
    if (!order.shippingAddress) {
      this.logger.error(
        `❌ [CREATE SHIPMENT] FAILED - Order ${order.orderNumber}: Missing shipping address`,
      );
      throw new BadRequestException('Order missing shipping address');
    }

    // ✅ Cast esplicito per TypeScript
    const shippingAddr = order.shippingAddress as {
      name: string;
      street: string;
      city: string;
      postalCode: string;
      provinceCode?: string;
      country: string;
      phone?: string;
    };

    // ✅ VALIDAZIONE campi obbligatori BRT
    if (!shippingAddr.name || !shippingAddr.street || !shippingAddr.city ||
      !shippingAddr.postalCode || !shippingAddr.country) {
      this.logger.error(
        `❌ [CREATE SHIPMENT] FAILED - Order ${order.orderNumber}: Incomplete shipping address`,
      );
      throw new BadRequestException(
        `Indirizzo di spedizione incompleto. Campi richiesti: name, street, city, postalCode, country`,
      );
    }

    // Calcola peso e colli
    const weightKG = options.weightKG || this.calculateWeight(order);
    const numberOfParcels = options.numberOfParcels || this.calculateParcels(order);

    this.logger.log(`📊 [CREATE SHIPMENT] Calculated metrics:`);
    this.logger.log(`   ├─ Weight: ${weightKG} kg`);
    this.logger.log(`   ├─ Parcels: ${numberOfParcels}`);
    this.logger.log(`   └─ Volume: ${this.calculateVolume(order)} m³`);

    // Prepara payload BRT
    const payload: BrtCreateShipmentRequest = {
      account: {
        userID: this.userID, // ✅ Già stringa dal .env
        password: this.password,
      },
      createData: {
        // Network e filiale
        network: '',
        departureDepot: this.departureDepot,
        senderCustomerCode: this.senderCustomerCode,
        deliveryFreightTypeCode: this.deliveryFreightType,

        // ✅ Destinatario (da campo JSON)
        consigneeCompanyName: shippingAddr.name,
        consigneeAddress: shippingAddr.street,
        consigneeZIPCode: shippingAddr.postalCode,
        consigneeCity: shippingAddr.city,
        consigneeProvinceAbbreviation: this.extractProvince(shippingAddr),
        consigneeCountryAbbreviationISOAlpha2: shippingAddr.country || 'IT',

        // Contatti destinatario
        consigneeContactName: shippingAddr.name,
        consigneeTelephone: shippingAddr.phone || '',
        consigneeEMail: order.customerEmail || order.user?.email || '',
        consigneeMobilePhoneNumber: shippingAddr.phone || '',
        isAlertRequired: '1',

        // Servizio e tariffe
        pricingConditionCode: this.pricingConditionCode,
        serviceType: options.serviceType || '',

        // Pacco
        numberOfParcels,
        weightKG,
        volumeM3: this.calculateVolume(order),

        // ✅ FIX: Campi COD aggiunti (obbligatori anche se non usati)
        cashOnDelivery: 0,
        isCODMandatory: '0',
        codPaymentType: '',
        codCurrency: 'EUR',

        // Riferimenti mittente (UNIVOCI per cancellazione/conferma)
        numericSenderReference: this.generateNumericReference(order),
        alphanumericSenderReference: order.orderNumber,

        // Valori
        declaredParcelValue: Number(order.total),
        declaredParcelValueCurrency: 'EUR',

        // Note
        notes: options.notes || `Ordine ${order.orderNumber}`,
        senderParcelType: 'COSMETICI',

        // Mittente originale (Warehouse Tortoreto)
        originalSenderCompanyName: this.warehouseCompany,
        originalSenderZIPCode: this.warehousePostalCode,
        originalSenderCountryAbbreviationISOAlpha2: this.warehouseCountry,
      },
      isLabelRequired: options.generateLabel !== false ? '1' : '0',
      labelParameters: options.generateLabel !== false ? {
        outputType: 'PDF',
        offsetX: 0,
        offsetY: 0,
        isBorderRequired: '1',
        isLogoRequired: '1',
        isBarcodeControlRowRequired: '1',
      } : undefined,
    };

    // Log payload (sanitizzato)
    this.logger.log(`📤 [CREATE SHIPMENT] Sending to BRT API:`);
    this.logger.log(`   ├─ Destination: ${shippingAddr.city} (${shippingAddr.postalCode})`);
    this.logger.log(`   ├─ Phone: ${shippingAddr.phone || 'N/A'}`);
    this.logger.log(`   └─ Email: ${order.customerEmail || 'N/A'}`);
    // Log payload (sanitizzato)
    this.logger.log(`📤 [CREATE SHIPMENT] Sending to BRT API:`);
    this.logger.log(`   ├─ Endpoint: POST ${this.apiUrl}/shipments/shipment`);
    this.logger.log(`   ├─ Customer Code: ${this.senderCustomerCode}`);
    this.logger.log(`   ├─ Departure Depot: ${this.departureDepot}`);
    this.logger.log(`   ├─ Pricing Code: ${this.pricingConditionCode}`);
    this.logger.log(`   ├─ Numeric Ref: ${payload.createData.numericSenderReference}`);
    this.logger.log(`   ├─ Alpha Ref: ${payload.createData.alphanumericSenderReference}`);
    this.logger.log(`   ├─ Destination: ${payload.createData.consigneeCity} (${payload.createData.consigneeZIPCode})`);
    this.logger.log(`   └─ Generate Label: ${payload.isLabelRequired === '1' ? 'YES' : 'NO'}`);

    try {
      // Chiamata API BRT
      const response = await firstValueFrom(
        this.httpService.post<BrtCreateShipmentResponse>(
          `${this.apiUrl}/shipments/shipment`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          },
        ),
      );

      const data = response.data;
      const execMsg = data.createResponse.executionMessage;
      const elapsed = Date.now() - startTime;

      // Log response completo
      this.logger.log(`📥 [CREATE SHIPMENT] BRT Response received (${elapsed}ms):`);
      this.logger.log(`   ├─ Code: ${execMsg.code}`);
      this.logger.log(`   ├─ Message: ${execMsg.message}`);
      this.logger.log(`   └─ Description: ${execMsg.codeDesc || 'N/A'}`);

      // Log risultato
      if (execMsg.code < 0) {
        // Errore
        const label = data.createResponse.labels?.label?.[0];
        this.logger.error(`❌ [CREATE SHIPMENT] FAILED - Order ${order.orderNumber} (${elapsed}ms)`);
        this.logger.error(`   ├─ Error Code: ${execMsg.code}`);
        this.logger.error(`   ├─ Error Message: ${execMsg.message}`);
        this.logger.error(`   ├─ Error Description: ${execMsg.codeDesc}`);
        this.logger.error(`   └─ Full Response: ${JSON.stringify(data, null, 2)}`);
        throw new BadRequestException(`BRT API Error: ${execMsg.codeDesc} - ${execMsg.message}`);
      } else if (execMsg.code > 0) {
        // Warning
        const label = data.createResponse.labels?.label?.[0];
        this.logger.warn(`⚠️ [CREATE SHIPMENT] SUCCESS with WARNING - Order ${order.orderNumber} (${elapsed}ms)`);
        this.logger.warn(`   ├─ Warning Code: ${execMsg.code}`);
        this.logger.warn(`   ├─ Warning Message: ${execMsg.message}`);
        this.logger.warn(`   ├─ ParcelID: ${label?.parcelID || 'N/A'}`);
        this.logger.warn(`   └─ Tracking: ${label?.trackingByParcelID || 'N/A'}`);
      } else {
        // Success
        const label = data.createResponse.labels?.label?.[0];
        const labelSize = label?.stream ? `${Math.round(label.stream.length / 1024)} KB` : 'N/A';
        this.logger.log(`✅ [CREATE SHIPMENT] SUCCESS - Order ${order.orderNumber} (${elapsed}ms)`);
        this.logger.log(`   ├─ ParcelID: ${label?.parcelID}`);
        this.logger.log(`   ├─ Tracking: ${label?.trackingByParcelID}`);
        this.logger.log(`   ├─ Label Size: ${labelSize}`);
        this.logger.log(`   ├─ Customer Code: ${this.senderCustomerCode}`);
        this.logger.log(`   └─ Depot: ${this.departureDepot}`);
      }
      
      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(`❌ [CREATE SHIPMENT] HTTP ERROR - Order ${order.orderNumber} (${elapsed}ms)`);
      this.logger.error(`   ├─ Error Type: ${error.name}`);
      this.logger.error(`   ├─ HTTP Status: ${error.response?.status || 'N/A'}`);
      this.logger.error(`   ├─ Error Message: ${error.message}`);

      if (error.response?.data) {
        this.logger.error(`   ├─ BRT Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }

      if (error.stack) {
        this.logger.error(`   └─ Stack Trace: ${error.stack}`);
      }

      throw new InternalServerErrorException(
        `Failed to create BRT shipment: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * ==========================================
   * CONFIRM SHIPMENT
   * ==========================================
   * Conferma una spedizione precedentemente creata
   * DEVE essere chiamata DOPO il ritiro manuale dal portale BRT
   */
  async confirmShipment(order: Order): Promise<BrtConfirmShipmentResponse> {
    const startTime = Date.now();

    this.logger.log(`✅ [CONFIRM SHIPMENT] START - Order: ${order.orderNumber} (${order.id})`);
    this.logger.log(`   ├─ Status: ${order.status}`);
    this.logger.log(`   ├─ BRT Shipment ID: ${order.brtShipmentId || 'N/A'}`);
    this.logger.log(`   └─ Tracking: ${order.brtTrackingNumber || 'N/A'}`);

    if (!order.brtShipmentId) {
      this.logger.error(`❌ [CONFIRM SHIPMENT] FAILED - Order ${order.orderNumber}: No BRT shipment to confirm`);
      throw new BadRequestException('Order has no BRT shipment to confirm');
    }

    const payload: BrtConfirmShipmentRequest = {
      account: {
        userID: this.userID,
        password: this.password,
      },
      confirmData: {
        senderCustomerCode: this.senderCustomerCode,
        numericSenderReference: this.generateNumericReference(order),
        alphanumericSenderReference: order.orderNumber,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.put<BrtConfirmShipmentResponse>(
          `${this.apiUrl}/shipments/shipment`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const data = response.data;
      const execMsg = data.confirmResponse.executionMessage;

      if (execMsg.code < 0) {
        this.logger.error(`❌ BRT Confirm Error ${execMsg.code}: ${execMsg.message}`);
        throw new BadRequestException(`BRT Confirm Error: ${execMsg.codeDesc} - ${execMsg.message}`);
      }

      this.logger.log(`✅ BRT Shipment confirmed: ${order.orderNumber}`);
      return data;
    } catch (error) {
      this.logger.error('❌ BRT Confirm Error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to confirm BRT shipment: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * ==========================================
   * DELETE SHIPMENT
   * ==========================================
   * Cancella una spedizione (per modifiche ordine)
   * Cancellabile solo se non ancora ritirata da BRT
   */
  async deleteShipment(order: Order, reason?: string): Promise<BrtDeleteShipmentResponse> {
    this.logger.log(`🗑️ Deleting BRT shipment for order ${order.orderNumber} - Reason: ${reason || 'N/A'}`);

    if (!order.brtShipmentId) {
      throw new BadRequestException('Order has no BRT shipment to delete');
    }

    const payload: BrtDeleteShipmentRequest = {
      account: {
        userID: this.userID,
        password: this.password,
      },
      deleteData: {
        senderCustomerCode: this.senderCustomerCode,
        numericSenderReference: this.generateNumericReference(order),
        alphanumericSenderReference: order.orderNumber,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.put<BrtDeleteShipmentResponse>(
          `${this.apiUrl}/shipments/delete`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const data = response.data;
      const execMsg = data.deleteResponse.executionMessage;

      if (execMsg.code < 0) {
        this.logger.error(`❌ BRT Delete Error ${execMsg.code}: ${execMsg.message}`);

        // Errore specifico: spedizione già ritirata
        if (execMsg.code === BrtErrorCode.ALREADY_IN_MANAGEMENT) {
          throw new BadRequestException('Shipment already picked up by BRT, cannot delete');
        }

        throw new BadRequestException(`BRT Delete Error: ${execMsg.codeDesc} - ${execMsg.message}`);
      }

      this.logger.log(`✅ BRT Shipment deleted: ${order.orderNumber}`);
      return data;
    } catch (error) {
      this.logger.error('❌ BRT Delete Error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to delete BRT shipment: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * ==========================================
   * TRACKING
   * ==========================================
   * Ottiene info tracking da BRT
   */
  async getTracking(trackingNumber: string): Promise<BrtTrackingResponse> {
    this.logger.log(`📍 Fetching tracking for: ${trackingNumber}`);

    const payload: BrtTrackingByParcelIDRequest = {
      account: {
        userID: this.userID,
        password: this.password,
      },
      parcelID: trackingNumber,
      languageCode: 'IT',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get<BrtTrackingResponse>(
          `${this.apiUrl}/tracking`,
          {
            params: payload,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const data = response.data;
      const execMsg = data.ttParcelIdResponse.executionMessage;

      if (execMsg.code < 0) {
        this.logger.error(`❌ BRT Tracking Error ${execMsg.code}: ${execMsg.message}`);
        throw new BadRequestException(`BRT Tracking Error: ${execMsg.codeDesc}`);
      }

      return data;
    } catch (error) {
      this.logger.error('❌ BRT Tracking Error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to fetch tracking: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * ==========================================
   * UTILITY METHODS
   * ==========================================
   */

  /**
   * Genera riferimento numerico univoco dall'ordine
   * Usa il timestamp dell'ordine per garantire unicità
   */
  private generateNumericReference(order: Order): number {
    // Usa millisecondi da epoch (primi 15 digits)
    const timestamp = new Date(order.createdAt).getTime();
    const ref = Math.floor(timestamp / 1000); // Secondi (10 digits)
    return ref;
  }

  /**
   * Calcola peso totale ordine (kg)
   */
  private calculateWeight(order: Order): number {
    // Default weight per product
    const defaultWeight = parseFloat(
      this.configService.get<string>('DEFAULT_PACKAGE_WEIGHT', '0.5'),
    );

    if (!order.items || order.items.length === 0) {
      return defaultWeight;
    }

    // Somma peso di tutti i prodotti
    const totalWeight = order.items.reduce((sum, item) => {
      const productWeight = (item.variant?.product as any)?.weight || defaultWeight;
      return sum + (productWeight * item.quantity);
    }, 0);

    return Math.max(totalWeight, 0.1); // Min 0.1 kg
  }

  /**
   * Calcola numero colli
   */
  private calculateParcels(order: Order): number {
    if (!order.items || order.items.length === 0) {
      return 1;
    }

    // Somma quantità prodotti
    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // 1 collo ogni 3 prodotti (puoi personalizzare)
    return Math.max(Math.ceil(totalItems / 3), 1);
  }

  /**
   * Calcola volume m³ (opzionale)
   */
  private calculateVolume(order: Order): number {
    const defaultLength = parseFloat(
      this.configService.get<string>('DEFAULT_PACKAGE_LENGTH', '20'),
    );
    const defaultWidth = parseFloat(
      this.configService.get<string>('DEFAULT_PACKAGE_WIDTH', '15'),
    );
    const defaultHeight = parseFloat(
      this.configService.get<string>('DEFAULT_PACKAGE_HEIGHT', '10'),
    );

    // Volume in cm³ → m³
    const volumeCm3 = defaultLength * defaultWidth * defaultHeight;
    const volumeM3 = volumeCm3 / 1000000;

    return Math.round(volumeM3 * 1000) / 1000; // 3 decimali
  }

  /**
   * Estrae sigla provincia dall'indirizzo
   */
  private extractProvince(address: any): string | undefined {
    // 1. Prova provinceCode (se è già la sigla di 2 lettere)
    if (address.provinceCode?.length === 2) {
      return address.provinceCode.toUpperCase();
    }

    // 2. Mappa completa province italiane (nome → sigla)
    const provinceMap: Record<string, string> = {
      'AGRIGENTO': 'AG', 'ALESSANDRIA': 'AL', 'ANCONA': 'AN', 'AOSTA': 'AO',
      'ASCOLI PICENO': 'AP', 'L\'AQUILA': 'AQ', 'AREZZO': 'AR', 'ASTI': 'AT',
      'AVELLINO': 'AV', 'BARI': 'BA', 'BERGAMO': 'BG', 'BIELLA': 'BI',
      'BELLUNO': 'BL', 'BENEVENTO': 'BN', 'BOLOGNA': 'BO', 'BRINDISI': 'BR',
      'BRESCIA': 'BS', 'BARLETTA-ANDRIA-TRANI': 'BT', 'BOLZANO': 'BZ',
      'CAGLIARI': 'CA', 'CAMPOBASSO': 'CB', 'CASERTA': 'CE', 'CHIETI': 'CH',
      'CALTANISSETTA': 'CL', 'CUNEO': 'CN', 'COMO': 'CO', 'CREMONA': 'CR',
      'COSENZA': 'CS', 'CATANIA': 'CT', 'CATANZARO': 'CZ', 'ENNA': 'EN',
      'FORLÌ-CESENA': 'FC', 'FERRARA': 'FE', 'FOGGIA': 'FG', 'FIRENZE': 'FI',
      'FERMO': 'FM', 'FROSINONE': 'FR', 'GENOVA': 'GE', 'GORIZIA': 'GO',
      'GROSSETO': 'GR', 'IMPERIA': 'IM', 'ISERNIA': 'IS', 'CROTONE': 'KR',
      'LECCO': 'LC', 'LECCE': 'LE', 'LIVORNO': 'LI', 'LODI': 'LO',
      'LATINA': 'LT', 'LUCCA': 'LU', 'MONZA E BRIANZA': 'MB', 'MACERATA': 'MC',
      'MESSINA': 'ME', 'MILANO': 'MI', 'MANTOVA': 'MN', 'MODENA': 'MO',
      'MASSA-CARRARA': 'MS', 'MATERA': 'MT', 'NAPOLI': 'NA', 'NOVARA': 'NO',
      'NUORO': 'NU', 'ORISTANO': 'OR', 'PALERMO': 'PA', 'PIACENZA': 'PC',
      'PADOVA': 'PD', 'PESCARA': 'PE', 'PERUGIA': 'PG', 'PISA': 'PI',
      'PORDENONE': 'PN', 'PRATO': 'PO', 'PARMA': 'PR', 'PISTOIA': 'PT',
      'PESARO E URBINO': 'PU', 'PAVIA': 'PV', 'POTENZA': 'PZ', 'RAVENNA': 'RA',
      'REGGIO CALABRIA': 'RC', 'REGGIO EMILIA': 'RE', 'RAGUSA': 'RG',
      'RIETI': 'RI', 'ROMA': 'RM', 'RIMINI': 'RN', 'ROVIGO': 'RO',
      'SALERNO': 'SA', 'SIENA': 'SI', 'SONDRIO': 'SO', 'LA SPEZIA': 'SP',
      'SIRACUSA': 'SR', 'SASSARI': 'SS', 'SUD SARDEGNA': 'SU', 'SAVONA': 'SV',
      'TARANTO': 'TA', 'TERAMO': 'TE', 'TRENTO': 'TN', 'TORINO': 'TO',
      'TRAPANI': 'TP', 'TERNI': 'TR', 'TRIESTE': 'TS', 'TREVISO': 'TV',
      'UDINE': 'UD', 'VARESE': 'VA', 'VERBANO-CUSIO-OSSOLA': 'VB',
      'VERCELLI': 'VC', 'VENEZIA': 'VE', 'VICENZA': 'VI', 'VERONA': 'VR',
      'VITERBO': 'VT', 'VIBO VALENTIA': 'VV',
    };

    // 3. Prova a mappare da provinceCode (se contiene il nome completo)
    if (address.provinceCode) {
      const normalized = address.provinceCode.toUpperCase().trim();
      const sigla = provinceMap[normalized];
      if (sigla) return sigla;
    }

    // 4. Prova a mappare da province
    if (address.province) {
      const normalized = address.province.toUpperCase().trim();
      const sigla = provinceMap[normalized];
      if (sigla) return sigla;
    }

    // 5. Fallback: estrai dal city (es. "Roma (RM)")
    const match = address.city?.match(/\(([A-Z]{2})\)/);
    return match ? match[1] : undefined;
  }
  /**
   * Controlla se l'ordine può essere spedito
   */
  canCreateShipment(order: Order): boolean {
    return (
      order.status === OrderStatus.CONFIRMED ||
      order.status === OrderStatus.PROCESSING
    ) && !order.brtShipmentId;
  }

  /**
   * Controlla se la spedizione può essere confermata
   */
  canConfirmShipment(order: Order): boolean {
    return (
      !!order.brtShipmentId &&
      order.status === OrderStatus.READY_TO_SHIP
    );
  }

  /**
   * Controlla se la spedizione può essere cancellata
   */
  canDeleteShipment(order: Order): boolean {
    return (
      !!order.brtShipmentId &&
      (order.status === OrderStatus.READY_TO_SHIP ||
        order.status === OrderStatus.CONFIRMED)
    );
  }
}