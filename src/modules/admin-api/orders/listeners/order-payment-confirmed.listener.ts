// import { Injectable, Logger } from '@nestjs/common';
// import { OnEvent } from '@nestjs/event-emitter';
// import { InjectQueue } from '@nestjs/bull';
// import { Queue } from 'bull';
// import { QueueNames, ShipmentJobName } from 'src/modules/public-api/queue/enums/queue-names.enum';

// @Injectable()
// export class OrderPaymentConfirmedEnqueueListener {
//   private readonly logger = new Logger(OrderPaymentConfirmedEnqueueListener.name);

//   constructor(@InjectQueue(QueueNames.SHIPMENT) private readonly shipmentQueue: Queue) {}

//   @OnEvent('payment.succeeded')
//   async handlePaymentSucceeded(payload: { order: any }) {
//     try {
//       if (String(process.env.AUTO_CREATE_SHIPMENT_ON_PAYMENT || 'true') !== 'true') {
//         this.logger.log('AUTO_CREATE_SHIPMENT_ON_PAYMENT=false → skip creazione spedizione');
//         return;
//       }
//       await this.shipmentQueue.add(ShipmentJobName.CREATE_SHIPMENT, { orderId: payload.order.id }, {
//         attempts: 3,
//         backoff: { type: 'exponential', delay: 5000 },
//       });
//       this.logger.log(`🚚 Enqueued create-shipment per ordine ${payload.order.orderNumber}`);
//     } catch (err) {
//       this.logger.error('Errore enqueue create-shipment:', err);
//     }
//   }
// }