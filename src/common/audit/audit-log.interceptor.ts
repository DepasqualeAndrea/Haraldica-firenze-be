// src/common/audit/audit-log.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { AuditAction, AuditSeverity } from 'src/database/entities/audit-log.entity';

/**
 * Decorator key per configurare l'audit su singoli endpoint
 */
export const AUDIT_LOG_KEY = 'audit_log';

export interface AuditLogOptions {
  action: AuditAction;
  entityType?: string;
  entityIdParam?: string; // Nome del param URL (es. 'id', 'userId')
  description?: string;
  severity?: AuditSeverity;
  captureBody?: boolean; // Se catturare il body della request
  captureResponse?: boolean; // Se catturare la response
}

/**
 * Decorator per configurare audit log su singoli endpoint
 *
 * @example
 * @AuditLog({
 *   action: AuditAction.USER_UPDATE,
 *   entityType: 'user',
 *   entityIdParam: 'id',
 *   description: 'Aggiornamento dati utente'
 * })
 * @Patch(':id')
 * async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) { ... }
 */
export function AuditLog(options: AuditLogOptions): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(AUDIT_LOG_KEY, options, descriptor.value!);
    return descriptor;
  };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();

    // Recupera configurazione audit dal decorator
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      handler,
    );

    // Se non c'è decorator @AuditLog, non fare nulla
    if (!auditOptions) {
      return next.handle();
    }

    const startTime = Date.now();
    const { action, entityType, entityIdParam, captureBody, captureResponse } =
      auditOptions;

    // Estrai info dalla request
    const adminUser = request.user;
    const adminId = adminUser?.id || adminUser?.sub;
    const adminEmail = adminUser?.email;
    const entityId = entityIdParam ? request.params[entityIdParam] : undefined;
    const ipAddress = this.getClientIp(request);
    const userAgent = request.headers['user-agent'];
    const endpoint = `${request.method} ${request.originalUrl}`;

    // Cattura body se richiesto
    const requestBody = captureBody ? this.sanitizeRequestBody(request.body) : undefined;

    return next.handle().pipe(
      tap({
        next: async (responseData) => {
          // Successo - logga l'azione
          const duration = Date.now() - startTime;

          const description =
            auditOptions.description ||
            this.generateDescription(action, entityType, entityId, adminEmail);

          await this.auditLogService.log({
            adminId,
            adminEmail,
            action,
            severity: auditOptions.severity,
            entityType,
            entityId,
            description,
            previousData: requestBody,
            newData: captureResponse
              ? this.sanitizeResponseData(responseData)
              : undefined,
            metadata: {
              endpoint,
              method: request.method,
              duration,
              requestId: request.headers['x-request-id'],
            },
            ipAddress,
            userAgent,
          });
        },
        error: async (error) => {
          // Errore - logga comunque per audit trail
          const duration = Date.now() - startTime;

          await this.auditLogService.log({
            adminId,
            adminEmail,
            action,
            severity: AuditSeverity.WARNING,
            entityType,
            entityId,
            description: `FAILED: ${auditOptions.description || action} - ${error.message}`,
            previousData: requestBody,
            metadata: {
              endpoint,
              method: request.method,
              duration,
              error: error.message,
              errorCode: error.status || error.code,
              requestId: request.headers['x-request-id'],
            },
            ipAddress,
            userAgent,
          });
        },
      }),
    );
  }

  /**
   * Genera descrizione automatica se non fornita
   */
  private generateDescription(
    action: AuditAction,
    entityType?: string,
    entityId?: string,
    adminEmail?: string,
  ): string {
    const admin = adminEmail || 'Admin';
    const entity = entityType
      ? `${entityType}${entityId ? ` (${entityId})` : ''}`
      : '';

    const actionDescriptions: Record<AuditAction, string> = {
      [AuditAction.USER_CREATE]: `${admin} ha creato un nuovo utente ${entity}`,
      [AuditAction.USER_UPDATE]: `${admin} ha aggiornato ${entity}`,
      [AuditAction.USER_DELETE]: `${admin} ha eliminato ${entity}`,
      [AuditAction.USER_ROLE_CHANGE]: `${admin} ha modificato il ruolo di ${entity}`,
      [AuditAction.USER_PASSWORD_RESET]: `${admin} ha resettato la password di ${entity}`,
      [AuditAction.ORDER_UPDATE]: `${admin} ha aggiornato ordine ${entity}`,
      [AuditAction.ORDER_STATUS_CHANGE]: `${admin} ha cambiato stato ordine ${entity}`,
      [AuditAction.ORDER_CANCEL]: `${admin} ha cancellato ordine ${entity}`,
      [AuditAction.ORDER_REFUND]: `${admin} ha rimborsato ordine ${entity}`,
      [AuditAction.PRODUCT_CREATE]: `${admin} ha creato prodotto ${entity}`,
      [AuditAction.PRODUCT_UPDATE]: `${admin} ha aggiornato prodotto ${entity}`,
      [AuditAction.PRODUCT_DELETE]: `${admin} ha eliminato prodotto ${entity}`,
      [AuditAction.PRODUCT_PRICE_CHANGE]: `${admin} ha modificato prezzo prodotto ${entity}`,
      [AuditAction.PRODUCT_STOCK_ADJUST]: `${admin} ha modificato stock prodotto ${entity}`,
      [AuditAction.CATEGORY_CREATE]: `${admin} ha creato categoria ${entity}`,
      [AuditAction.CATEGORY_UPDATE]: `${admin} ha aggiornato categoria ${entity}`,
      [AuditAction.CATEGORY_DELETE]: `${admin} ha eliminato categoria ${entity}`,
      [AuditAction.INVENTORY_ADJUST]: `${admin} ha modificato inventario ${entity}`,
      [AuditAction.INVENTORY_RESERVE]: `${admin} ha riservato stock ${entity}`,
      [AuditAction.INVENTORY_RELEASE]: `${admin} ha rilasciato stock ${entity}`,
      [AuditAction.NEWSLETTER_SEND]: `${admin} ha inviato newsletter ${entity}`,
      [AuditAction.NEWSLETTER_CREATE]: `${admin} ha creato newsletter ${entity}`,
      [AuditAction.SETTINGS_UPDATE]: `${admin} ha modificato impostazioni`,
      [AuditAction.ADMIN_LOGIN]: `${admin} ha effettuato il login`,
      [AuditAction.ADMIN_LOGOUT]: `${admin} ha effettuato il logout`,
      [AuditAction.LOGIN_FAILED]: `Tentativo di login fallito per ${admin}`,
      [AuditAction.DATA_EXPORT]: `${admin} ha esportato dati ${entity}`,
      [AuditAction.DATA_DELETE]: `${admin} ha eliminato dati ${entity}`,
      [AuditAction.OTHER]: `${admin} ha eseguito azione ${entity}`,
    };

    return actionDescriptions[action] || `${admin} ha eseguito ${action} su ${entity}`;
  }

  /**
   * Estrai IP reale del client (considera proxy/load balancer)
   */
  private getClientIp(request: any): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    return (
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  /**
   * Sanitizza body request (rimuovi dati sensibili)
   */
  private sanitizeRequestBody(body: any): Record<string, any> | undefined {
    if (!body || typeof body !== 'object') return undefined;

    const sensitiveFields = [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'token',
      'accessToken',
      'refreshToken',
      'cardNumber',
      'cvv',
      'cvc',
    ];

    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Sanitizza response data
   */
  private sanitizeResponseData(data: any): Record<string, any> | undefined {
    if (!data || typeof data !== 'object') return undefined;

    // Per response grandi, mantieni solo un summary
    const maxSize = 10000; // ~10KB
    const stringified = JSON.stringify(data);

    if (stringified.length > maxSize) {
      return {
        _truncated: true,
        _originalSize: stringified.length,
        success: data.success,
        id: data.id,
        message: data.message,
      };
    }

    return data;
  }
}
