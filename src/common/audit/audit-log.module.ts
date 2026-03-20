// src/common/audit/audit-log.module.ts

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuditLog } from 'src/database/entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogController } from './audit-log.controller';

/**
 * Modulo globale per Audit Logging
 *
 * Uso:
 *
 * 1. Importa AuditLogModule nel tuo AppModule
 *
 * 2. Per logging automatico su endpoint, usa il decorator @AuditLog:
 *
 *    @AuditLog({
 *      action: AuditAction.USER_UPDATE,
 *      entityType: 'user',
 *      entityIdParam: 'id'
 *    })
 *    @Patch(':id')
 *    async updateUser(...) { }
 *
 * 3. Per logging manuale, inietta AuditLogService:
 *
 *    constructor(private auditLogService: AuditLogService) {}
 *
 *    await this.auditLogService.log({
 *      action: AuditAction.ORDER_REFUND,
 *      entityType: 'order',
 *      entityId: orderId,
 *      description: 'Rimborso ordine completato',
 *      adminId: currentUser.id,
 *      adminEmail: currentUser.email
 *    });
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ConfigModule,
  ],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditLogInterceptor,
  ],
  exports: [
    AuditLogService,
    AuditLogInterceptor,
    TypeOrmModule, // Esporta per accesso diretto al repository se necessario
  ],
})
export class AuditLogModule {}
