import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controller & Service
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

// Entities
import { Order } from 'src/database/entities/order.entity';
import { Shipment } from 'src/database/entities/shipment.entity';
import { ProductVariant } from 'src/database/entities/product-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Shipment, ProductVariant]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
