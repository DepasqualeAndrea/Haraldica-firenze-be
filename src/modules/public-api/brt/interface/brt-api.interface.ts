// src/modules/public-api/brt/interfaces/brt-api.interface.ts

/**
 * ==========================================
 * BRT API INTERFACES
 * ==========================================
 * Interfacce TypeScript per l'integrazione con le API REST di BRT
 * Documentazione: https://api.brt.it/rest/v1/shipments
 */

// ==========================================
// ACCOUNT & AUTHENTICATION
// ==========================================

export interface BrtAccount {
  userID: string;
  password: string;
}

// ==========================================
// EXECUTION MESSAGE
// ==========================================

export interface BrtExecutionMessage {
  code: number; // >0 warning, 0 success, <0 error
  severity: 'INFO' | 'WARNING' | 'ERROR';
  codeDesc: string;
  message: string;
}

// ==========================================
// CREATE SHIPMENT REQUEST
// ==========================================

export interface BrtCreateShipmentRequest {
  account: BrtAccount;
  createData: BrtCreateData;
  isLabelRequired: '0' | '1';
  labelParameters?: BrtLabelParameters;
  actualSender?: BrtActualSender; // Per Shop to Shop, Shop to Home
  returnShipmentConsignee?: BrtReturnShipmentConsignee; // Per resi
}

export interface BrtCreateData {
  // Required fields
  network?: string; // Default: stringa vuota (network standard BRT)
  departureDepot: number; // Filiale partenza (es. 151)
  senderCustomerCode: number; // Codice cliente (es. 1020109)
  deliveryFreightTypeCode: 'DAP' | 'EXW'; // DAP = franco, EXW = assegnato
  
  // Destinatario
  consigneeCompanyName: string; // Max 70
  consigneeAddress: string; // Min 6, Max 35 (IT) o 105 (estero)
  consigneeZIPCode: string; // Max 9
  consigneeCity: string; // Max 35
  consigneeProvinceAbbreviation?: string; // Max 2 (es. RM, MI)
  consigneeCountryAbbreviationISOAlpha2: string; // ISO 3166-1 alpha-2 (es. IT)
  
  // Contatti destinatario
  consigneeContactName?: string; // Max 35
  consigneeTelephone?: string; // Max 16
  consigneeEMail?: string; // Max 70 (separati da | per multipli)
  consigneeMobilePhoneNumber?: string; // Max 16
  isAlertRequired?: '0' | '1'; // Alert SMS/Email
  
  // Dati fiscali destinatario
  consigneeVATNumber?: string; // Max 16
  consigneeVATNumberCountryISOAlpha2?: string; // ISO alpha-2
  consigneeItalianFiscalCode?: string; // Max 16
  
  // Servizio e tariffe
  pricingConditionCode: string; // Es. "000" o "100"
  serviceType?: '' | 'E' | 'H'; // '' = standard, E = priority, H = 10:30
  
  // Pacco
  numberOfParcels: number; // Max 30
  weightKG: number; // Peso totale in kg
  volumeM3?: number; // Volume totale m³
  
  // Valori e assicurazione
  insuranceAmount?: number;
  insuranceAmountCurrency?: string; // Default: EUR
  declaredParcelValue?: number;
  declaredParcelValueCurrency?: string; // Default: EUR
  
  // Contrassegno
  cashOnDelivery?: number;
  isCODMandatory?: '0' | '1';
  codPaymentType?: string; // Max 2
  codCurrency?: string; // Default: EUR
  
  // Riferimenti mittente
  numericSenderReference: number; // Required - Max 15 digits
  alphanumericSenderReference?: string; // Max 15 - Case sensitive
  
  // Altri dati
  senderParcelType?: string; // Natura merce - Max 15
  notes?: string; // Max 70
  quantityToBeInvoiced?: number;
  
  // Date e consegna
  deliveryDateRequired?: string; // ISO format yyyy-MM-dd
  deliveryType?: string;
  
  // Orari chiusura destinatario
  consigneeClosingShift1_DayOfTheWeek?: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  consigneeClosingShift1_PeriodOfTheDay?: 'AM' | 'PM';
  consigneeClosingShift2_DayOfTheWeek?: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  consigneeClosingShift2_PeriodOfTheDay?: 'AM' | 'PM';
  
  // Codici particolarità
  parcelsHandlingCode?: string; // Max 2
  particularitiesDeliveryManagementCode?: string; // Max 2
  particularitiesHoldOnStockManagementCode?: string; // Max 2
  variousParticularitiesManagementCode?: string; // Max 2
  particularDelivery1?: string; // Max 1
  particularDelivery2?: string; // Max 1
  
  // Pallet
  palletType1?: string; // Es. "EPAL"
  palletType1Number?: number;
  palletType2?: string;
  palletType2Number?: number;
  
  // Mittente originale
  originalSenderCompanyName?: string; // Max 25
  originalSenderZIPCode?: string; // Max 9
  originalSenderCountryAbbreviationISOAlpha2?: string; // Max 2
  
  // CMR e autorizzazioni
  cmrCode?: string; // Max 35 - Case sensitive
  neighborNameMandatoryAuthorization?: string; // Max 70
  pinCodeMandatoryAuthorization?: string; // Max 15
  
  // Packing list PDF
  packingListPDFName?: string; // Max 33
  packingListPDFFlagPrint?: string;
  packingListPDFFlagEmail?: string;
  
  // PUDO e servizi speciali
  pudoId?: string; // Max 20 - BRTfermopoint
  brtServiceCode?: '' | 'B11' | 'B13' | 'B14' | 'B15' | 'B20';
  // B11 = Direct to Shop
  // B13 = Shop to Shop
  // B14 = Shop to Home
  // B15 = Return from Shop
  // B20 = FRESH (0-4°C)
  
  returnDepot?: number; // Per B15
  expiryDate?: string; // Per B20 FRESH - ISO yyyy-MM-dd
  holdForPickup?: '0' | '1'; // Fermo deposito
  genericReference?: string; // Max 35
}

export interface BrtLabelParameters {
  outputType: 'PDF' | 'ZPL'; // PDF o Zebra Programming Language
  offsetX?: number; // Distanza orizzontale
  offsetY?: number; // Distanza verticale
  isBorderRequired?: '0' | '1';
  isLogoRequired?: '0' | '1';
  isBarcodeControlRowRequired?: '0' | '1';
  labelFormat?: '' | 'DP5' | 'DPH'; // '' = BRT standard 95x65mm
}

export interface BrtActualSender {
  actualSenderName: string; // Required - Max 70
  actualSenderCity?: string; // Max 35
  actualSenderAddress?: string; // Max 35
  actualSenderZIPCode?: string; // Max 9
  actualSenderProvince?: string; // Max 2
  actualSenderCountry?: string; // ISO alpha-2
  actualSenderEmail: string; // Required - Max 70
  actualSenderMobilePhoneNumber: string; // Required - Max 16
  actualSenderPudoId?: string; // Max 20
}

export interface BrtReturnShipmentConsignee {
  returnShipmentConsigneeName: string; // Required - Max 70
  returnShipmentConsigneeCity: string; // Required - Max 35
  returnShipmentConsigneeAddress: string; // Required - Max 35
  returnShipmentConsigneeZIPCode: string; // Required - Max 9
  returnShipmentConsigneeProvince?: string; // Max 2
  returnShipmentConsigneeCountry: string; // Required - ISO alpha-2
  returnShipmentConsigneeEmail: string; // Required - Max 70
  returnShipmentConsigneeMobilePhoneNumber: string; // Required - Max 16
  returnShipmentConsigneePudoId?: string; // Max 20
}

// ==========================================
// CREATE SHIPMENT RESPONSE
// ==========================================

export interface BrtCreateShipmentResponse {
  createResponse: {
    currentTimeUTC: string;
    executionMessage: BrtExecutionMessage;
    
    // Dati instradamento
    arrivalTerminal: string;
    arrivalDepot: string;
    deliveryZone: string;
    
    // Numeri spedizione
    parcelNumberFrom: string;
    parcelNumberTo: string;
    departureDepot: number;
    seriesNumber: number;
    serviceType: string;
    
    // Dati destinatario normalizzati
    consigneeCompanyName: string;
    consigneeAddress: string;
    consigneeZIPCode: string;
    consigneeCity: string;
    consigneeProvinceAbbreviation: string;
    consigneeCountryAbbreviationBRT: string;
    
    // Dati pacco
    numberOfParcels: number;
    weightKG: number;
    volumeM3: number;
    
    // Riferimenti
    alphanumericSenderReference: string;
    senderCompanyName: string;
    senderProvinceAbbreviation: string;
    
    // Etichette
    labels?: BrtLabels;
    disclaimer?: string;
  };
}

export interface BrtLabels {
  label: BrtLabel[];
}

export interface BrtLabel {
  dataLength: number;
  parcelID: string; // Barcode BRT (18 caratteri)
  trackingByParcelID: string; // Per tracking API (15 caratteri)
  parcelNumberGeoPost?: string;
  stream: string; // Base64 encoded PDF/ZPL
  streamDigitalLabel?: string; // Base64 encoded PNG (2D Code)
}

// ==========================================
// CONFIRM SHIPMENT REQUEST
// ==========================================

export interface BrtConfirmShipmentRequest {
  account: BrtAccount;
  confirmData: BrtConfirmData;
}

export interface BrtConfirmData {
  senderCustomerCode: number;
  numericSenderReference: number;
  alphanumericSenderReference?: string; // Case sensitive
  cmrCode?: string; // Per accorpamento bolle
}

// ==========================================
// CONFIRM SHIPMENT RESPONSE
// ==========================================

export interface BrtConfirmShipmentResponse {
  confirmResponse: {
    currentTimeUTC: string;
    executionMessage: BrtExecutionMessage;
  };
}

// ==========================================
// DELETE SHIPMENT REQUEST
// ==========================================

export interface BrtDeleteShipmentRequest {
  account: BrtAccount;
  deleteData: BrtDeleteData;
}

export interface BrtDeleteData {
  senderCustomerCode: number;
  numericSenderReference: number;
  alphanumericSenderReference?: string; // Case sensitive
}

// ==========================================
// DELETE SHIPMENT RESPONSE
// ==========================================

export interface BrtDeleteShipmentResponse {
  deleteResponse: {
    currentTimeUTC: string;
    executionMessage: BrtExecutionMessage;
  };
}

// ==========================================
// ROUTING REQUEST
// ==========================================

export interface BrtRoutingRequest {
  account: BrtAccount;
  routingData: BrtRoutingData;
}

export interface BrtRoutingData {
  network?: string;
  departureDepot: number;
  senderCustomerCode: number;
  deliveryFreightTypeCode: 'DAP' | 'EXW';
  consigneeCompanyName: string;
  consigneeAddress: string;
  consigneeZIPCode: string;
  consigneeCity: string;
  consigneeProvinceAbbreviation?: string;
  consigneeCountryAbbreviationISOAlpha2: string;
  serviceType?: '' | 'E' | 'H';
  numberOfParcels: number;
  weightKG: number;
  volumeM3?: number;
  variousParticularitiesManagementCode?: string;
  particularDelivery1?: string;
  particularDelivery2?: string;
  pudoId?: string;
  holdForPickup?: '0' | '1';
}

// ==========================================
// ROUTING RESPONSE
// ==========================================

export interface BrtRoutingResponse {
  routingResponse: {
    currentTimeUTC: string;
    executionMessage: BrtExecutionMessage;
    arrivalTerminal: string;
    arrivalDepot: string;
    deliveryZone: string;
    consigneeZIPCode: string; // Può essere normalizzato
    consigneeCity: string; // Può essere normalizzato
    consigneeProvinceAbbreviation: string; // Può essere normalizzato
  };
}

// ==========================================
// TRACKING REQUEST
// ==========================================

export interface BrtTrackingByParcelIDRequest {
  account: BrtAccount;
  parcelID: string; // 15 caratteri (trackingByParcelID dalla create)
  languageCode?: string; // Default: IT
}

// ==========================================
// TRACKING RESPONSE
// ==========================================

export interface BrtTrackingResponse {
  ttParcelIdResponse: {
    currentTimeUTC: string;
    executionMessage: BrtExecutionMessage;
    spedizione?: BrtSpedizione;
  };
}

export interface BrtSpedizione {
  dati_spedizione: {
    numero_spedizione: string;
    codice_cliente: string;
    data_spedizione: string;
    mittente: string;
    destinatario: string;
    indirizzo: string;
    cap: string;
    localita: string;
    provincia: string;
    nazione: string;
  };
  eventi?: BrtEvento[];
  note?: BrtNota[];
  riferimenti?: string[];
  recapito_dest?: {
    ragione_sociale: string;
    indirizzo: string;
    cap: string;
    localita: string;
    provincia: string;
  };
}

export interface BrtEvento {
  data: string; // yyyy-MM-dd
  ora?: string; // HH:mm:ss
  descrizione: string;
  localita?: string;
}

export interface BrtNota {
  testo: string;
}

// ==========================================
// ERROR CODES REFERENCE
// ==========================================

export enum BrtErrorCode {
  // Errori comuni (-1 to -60)
  GENERIC_ERROR = -1,
  INVALID_PARAMETER = -5,
  LOGIN_FAILED = -7,
  MISSING_LOGIN_PARAM = -57,
  
  // Errori spedizione (-61 to -99)
  ROUTING_ERROR = -63,
  NUMBERING_ERROR = -64,
  LABEL_PRINT_ERROR = -65,
  ACCOUNT_ERROR = -67,
  INVALID_DATA = -68,
  INVALID_PUDO = -69,
  FRESH_SERVICE_ERROR = -70,
  QR_CODE_ERROR = -71,
  
  // Errori conferma/cancellazione (-100 to -160)
  NOT_CONFIRMABLE = -101,
  ALREADY_CONFIRMED = -102,
  SHIPMENT_NOT_FOUND = -151,
  ALREADY_IN_MANAGEMENT = -152,
  SHIPMENT_PROCESSING = -153,
  MULTIPLE_SHIPMENTS_FOUND = -154,
  RECORD_LOCKED = -155,
}

export enum BrtWarningCode {
  DATA_NORMALIZED = 4, // CAP/Località/Provincia normalizzati
  PUDO_ADDRESS_CHANGED = 5, // Indirizzo sostituito con PUDO
  RETURN_DEPOT_ADDRESS = 6, // Dati destinatario sostituiti con deposito reso
  QR_CODE_FAILED_BUT_CREATED = 7, // Spedizione creata ma QR Code fallito
}