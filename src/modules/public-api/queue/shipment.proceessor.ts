// import { Processor, Process } from '@nestjs/bull';
// import { Logger } from '@nestjs/common';
// import { Job } from 'bull';
// import { QueueNames, ShipmentJobName } from './enums/queue-names.enum';
// import { ShippingService } from '../shipping/shipping.service';

// @Processor(QueueNames.SHIPMENT)
// export class ShipmentProcessor {
//   private readonly logger = new Logger(ShipmentProcessor.name);

//   constructor(private readonly shippingService: ShippingService) {}

//   @Process(ShipmentJobName.CREATE_SHIPMENT)
//   async create(job: Job<{ orderId: string }>) {
//     const { orderId } = job.data;
//     this.logger.log(`📦 Job create-shipment → ordine ${orderId}`);
//     const shipment = await this.shippingService.createAndPayShipmentForOrder(orderId);
//     this.logger.log(`✅ Spedizione creata: tracking ${shipment.trackingCode}`);
//     return { shipmentId: shipment.id, tracking: shipment.trackingCode };
//   }
// }