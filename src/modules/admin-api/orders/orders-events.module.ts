// import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bull';
// import { OrderPaymentConfirmedEnqueueListener } from './listeners/order-payment-confirmed.listener';
// import { QueueNames } from 'src/modules/public-api/queue/enums/queue-names.enum';

// @Module({
//   imports: [
//     BullModule.registerQueue({ name: QueueNames.SHIPMENT }),
//   ],
//   providers: [OrderPaymentConfirmedEnqueueListener],
// })
// export class OrdersEventsModule {}