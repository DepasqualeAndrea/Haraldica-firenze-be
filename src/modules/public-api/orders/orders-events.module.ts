import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueNames } from '../queue/enums/queue-names.enum';
import { OrderPaymentConfirmedEnqueueListener } from './listeners/order-payment-confirmed.listener';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueNames.SHIPMENT }),
  ],
  providers: [OrderPaymentConfirmedEnqueueListener],
})
export class OrdersEventsModule {}