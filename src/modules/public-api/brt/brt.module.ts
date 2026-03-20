// src/modules/public-api/brt/brt.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BrtService } from './brt.service';
import { ShipmentsModule } from './shipments/shipments.module';
import { S3Service } from './S3/s3.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    forwardRef(() => ShipmentsModule),
  ],
  providers: [
    BrtService,
    S3Service, // ✅ AGGIUNGI
  ],
  exports: [
    BrtService,
    S3Service, // ✅ AGGIUNGI
  ],
})
export class BrtModule { }