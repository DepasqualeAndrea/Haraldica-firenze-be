export enum QueueNames {
  EMAIL = 'email',
  SHIPMENT = 'shipment',
  TRACKING = 'tracking',
}

export enum EmailJobName {
  SEND_EMAIL = 'send-email',
  SEND_ORDER_CONFIRMATION = 'send-order-confirmation',
  SEND_SHIPPING_NOTIFICATION = 'send-shipping-notification',
  SEND_DELIVERY_NOTIFICATION = 'send-delivery-notification',
  SEND_WELCOME_EMAIL = 'send-welcome-email',
  SEND_PASSWORD_RESET = 'send-password-reset',
}

export enum ShipmentJobName {
  CREATE_SHIPMENT = 'create-shipment',
  UPDATE_SHIPMENT = 'update-shipment',
  DOWNLOAD_LABEL = 'download-label',
  REQUEST_PICKUP = 'request-pickup',
}

export enum TrackingJobName {
  UPDATE_TRACKING = 'update-tracking',
  BATCH_UPDATE_TRACKING = 'batch-update-tracking',
}

export enum JobPriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
}