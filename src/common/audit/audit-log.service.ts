// src/common/audit/audit-log.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  AuditLog,
  AuditAction,
  AuditSeverity,
} from 'src/database/entities/audit-log.entity';

export interface CreateAuditLogDto {
  adminId?: string;
  adminEmail?: string;
  action: AuditAction;
  severity?: AuditSeverity;
  entityType?: string;
  entityId?: string;
  description: string;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilterDto {
  adminId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private configService: ConfigService,
  ) {
    // Default: 730 giorni (2 anni) per GDPR compliance
    this.retentionDays = this.configService.get<number>(
      'AUDIT_LOG_RETENTION_DAYS',
      730,
    );
  }

  /**
   * Crea un nuovo audit log
   */
  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    try {
      const auditLog = this.auditLogRepository.create({
        ...dto,
        severity: dto.severity || this.determineSeverity(dto.action),
      });

      const saved = await this.auditLogRepository.save(auditLog);

      // Log critico anche su console per monitoring immediato
      if (saved.severity === AuditSeverity.CRITICAL) {
        this.logger.warn(
          `🚨 CRITICAL AUDIT: [${dto.action}] ${dto.description} ` +
          `(Admin: ${dto.adminEmail || dto.adminId || 'Sistema'}, ` +
          `Entity: ${dto.entityType}:${dto.entityId})`,
        );
      }

      return saved;
    } catch (error) {
      // Non bloccare mai l'operazione principale per errori di audit
      this.logger.error(`❌ Errore creazione audit log: ${error.message}`, {
        dto,
        error: error.stack,
      });
      return null as any;
    }
  }

  /**
   * Shortcut per log di login admin
   */
  async logAdminLogin(
    adminId: string,
    adminEmail: string,
    ipAddress: string,
    userAgent: string,
    success: boolean = true,
  ): Promise<void> {
    await this.log({
      adminId,
      adminEmail,
      action: success ? AuditAction.ADMIN_LOGIN : AuditAction.LOGIN_FAILED,
      severity: success ? AuditSeverity.INFO : AuditSeverity.WARNING,
      description: success
        ? `Admin ${adminEmail} ha effettuato il login`
        : `Tentativo di login fallito per ${adminEmail}`,
      ipAddress,
      userAgent,
      metadata: { success },
    });
  }

  /**
   * Shortcut per log di modifica entità
   */
  async logEntityChange(
    adminId: string,
    adminEmail: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    description: string,
    previousData?: Record<string, any>,
    newData?: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.log({
      adminId,
      adminEmail,
      action,
      entityType,
      entityId,
      description,
      previousData: this.sanitizeData(previousData),
      newData: this.sanitizeData(newData),
      metadata,
    });
  }

  /**
   * Cerca audit logs con filtri
   */
  async findAll(filter: AuditLogFilterDto): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      adminId,
      action,
      entityType,
      entityId,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filter;

    const query = this.auditLogRepository.createQueryBuilder('audit');

    if (adminId) {
      query.andWhere('audit.adminId = :adminId', { adminId });
    }

    if (action) {
      query.andWhere('audit.action = :action', { action });
    }

    if (entityType) {
      query.andWhere('audit.entityType = :entityType', { entityType });
    }

    if (entityId) {
      query.andWhere('audit.entityId = :entityId', { entityId });
    }

    if (severity) {
      query.andWhere('audit.severity = :severity', { severity });
    }

    if (startDate) {
      query.andWhere('audit.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('audit.createdAt <= :endDate', { endDate });
    }

    const [data, total] = await query
      .orderBy('audit.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Ottieni audit log per una specifica entità
   */
  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
      take: 100, // Max 100 entries per entità
    });
  }

  /**
   * Ottieni statistiche audit
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<{
    totalLogs: number;
    byAction: Record<string, number>;
    bySeverity: Record<string, number>;
    byAdmin: Array<{ adminEmail: string; count: number }>;
    criticalActions: number;
  }> {
    const query = this.auditLogRepository.createQueryBuilder('audit');

    if (startDate) {
      query.andWhere('audit.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('audit.createdAt <= :endDate', { endDate });
    }

    // Total logs
    const totalLogs = await query.getCount();

    // By action
    const byActionRaw = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.action')
      .getRawMany();

    const byAction: Record<string, number> = {};
    for (const row of byActionRaw) {
      byAction[row.action] = parseInt(row.count, 10);
    }

    // By severity
    const bySeverityRaw = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.severity')
      .getRawMany();

    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityRaw) {
      bySeverity[row.severity] = parseInt(row.count, 10);
    }

    // By admin (top 10)
    const byAdmin = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.adminEmail', 'adminEmail')
      .addSelect('COUNT(*)', 'count')
      .where('audit.adminEmail IS NOT NULL')
      .groupBy('audit.adminEmail')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Critical actions
    const criticalActions = await this.auditLogRepository.count({
      where: { severity: AuditSeverity.CRITICAL },
    });

    return {
      totalLogs,
      byAction,
      bySeverity,
      byAdmin: byAdmin.map((row) => ({
        adminEmail: row.adminEmail,
        count: parseInt(row.count, 10),
      })),
      criticalActions,
    };
  }

  /**
   * Cleanup automatico log vecchi (CRON: ogni giorno alle 3:00)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    try {
      const result = await this.auditLogRepository.delete({
        createdAt: LessThan(cutoffDate),
      });

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `🧹 Cleanup audit logs: eliminati ${result.affected} log ` +
          `più vecchi di ${this.retentionDays} giorni`,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Errore cleanup audit logs: ${error.message}`);
    }
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================

  /**
   * Determina automaticamente la severità in base all'azione
   */
  private determineSeverity(action: AuditAction): AuditSeverity {
    const criticalActions = [
      AuditAction.USER_DELETE,
      AuditAction.USER_ROLE_CHANGE,
      AuditAction.ORDER_REFUND,
      AuditAction.ORDER_CANCEL,
      AuditAction.PRODUCT_DELETE,
      AuditAction.CATEGORY_DELETE,
      AuditAction.DATA_DELETE,
      AuditAction.LOGIN_FAILED,
      AuditAction.SETTINGS_UPDATE,
    ];

    const warningActions = [
      AuditAction.USER_PASSWORD_RESET,
      AuditAction.PRODUCT_PRICE_CHANGE,
      AuditAction.INVENTORY_ADJUST,
      AuditAction.DATA_EXPORT,
    ];

    if (criticalActions.includes(action)) {
      return AuditSeverity.CRITICAL;
    }

    if (warningActions.includes(action)) {
      return AuditSeverity.WARNING;
    }

    return AuditSeverity.INFO;
  }

  /**
   * Rimuovi dati sensibili prima di salvare
   */
  private sanitizeData(
    data?: Record<string, any>,
  ): Record<string, any> | undefined {
    if (!data) return undefined;

    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'stripeCustomerId',
      'stripePaymentMethodId',
      'cardNumber',
      'cvv',
      'ssn',
    ];

    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
