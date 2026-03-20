import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentsService } from './consents.service';
import { Consent } from 'src/database/entities/consent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Consent])],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}