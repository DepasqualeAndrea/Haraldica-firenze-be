// src/modules/public-api/brt/shipments/shipments.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Shipment } from 'src/database/entities/shipment.entity';
import { Order } from 'src/database/entities/order.entity';

// Modules
import { BrtModule } from '../brt.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AuthModule } from '../../auth/auth.module';

// Services & Controllers
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from 'src/modules/admin-api/shipments/shipments.controller';
import { DailyReportService } from 'src/modules/admin-api/shipments/daily-report.service';
import { ShipmentExportService } from 'src/modules/admin-api/shipments/shipment-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, Order]),
    forwardRef(() => BrtModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    DailyReportService,
    ShipmentExportService,
  ],
  exports: [
    ShipmentsService,
    DailyReportService,
    ShipmentExportService,
  ],
})
export class ShipmentsModule {}