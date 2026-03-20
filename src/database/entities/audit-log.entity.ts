// src/database/entities/audit-log.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * SECURITY & GDPR: Audit Log System
 *
 * Traccia tutte le azioni admin per:
 * - GDPR compliance (chi ha fatto cosa e quando)
 * - Security forensics (rilevamento accessi non autorizzati)
 * - Business analytics (pattern di utilizzo admin)
 *
 * Retention: 2 anni (configurabile via AUDIT_LOG_RETENTION_DAYS)
 */

export enum AuditAction {
  // User Management
  USER_CREATE = 'user.create',
  USER_UPDATE = 'user.update',
  USER_DELETE = 'user.delete',
  USER_ROLE_CHANGE = 'user.role_change',
  USER_PASSWORD_RESET = 'user.password_reset',

  // Order Management
  ORDER_UPDATE = 'order.update',
  ORDER_STATUS_CHANGE = 'order.status_change',
  ORDER_CANCEL = 'order.cancel',
  ORDER_REFUND = 'order.refund',

  // Product Management
  PRODUCT_CREATE = 'product.create',
  PRODUCT_UPDATE = 'product.update',
  PRODUCT_DELETE = 'product.delete',
  PRODUCT_PRICE_CHANGE = 'product.price_change',
  PRODUCT_STOCK_ADJUST = 'product.stock_adjust',

  // Category Management
  CATEGORY_CREATE = 'category.create',
  CATEGORY_UPDATE = 'category.update',
  CATEGORY_DELETE = 'category.delete',

  // Inventory
  INVENTORY_ADJUST = 'inventory.adjust',
  INVENTORY_RESERVE = 'inventory.reserve',
  INVENTORY_RELEASE = 'inventory.release',

  // Newsletter
  NEWSLETTER_SEND = 'newsletter.send',
  NEWSLETTER_CREATE = 'newsletter.create',

  // Settings
  SETTINGS_UPDATE = 'settings.update',

  // Auth
  ADMIN_LOGIN = 'auth.admin_login',
  ADMIN_LOGOUT = 'auth.admin_logout',
  LOGIN_FAILED = 'auth.login_failed',

  // Data Export (GDPR)
  DATA_EXPORT = 'gdpr.data_export',
  DATA_DELETE = 'gdpr.data_delete',

  // Generic
  OTHER = 'other',
}

export enum AuditSeverity {
  INFO = 'info',      // Azioni normali
  WARNING = 'warning', // Azioni che richiedono attenzione
  CRITICAL = 'critical', // Azioni critiche (delete, role change, refund)
}

@Entity('audit_logs')
@Index(['action', 'createdAt'])
@Index(['adminId', 'createdAt'])
@Index(['entityType', 'entityId'])
@Index(['severity', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Admin che ha eseguito l'azione
   */
  @Column({ nullable: true })
  @Index()
  adminId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin?: User;

  /**
   * Email admin (denormalizzata per query veloci e retention dopo user delete)
   */
  @Column({ nullable: true })
  adminEmail: string;

  /**
   * Tipo di azione
   */
  @Column({ type: 'varchar', length: 50 })
  @Index()
  action: AuditAction;

  /**
   * Severità dell'azione
   */
  @Column({ type: 'varchar', length: 20, default: AuditSeverity.INFO })
  severity: AuditSeverity;

  /**
   * Tipo di entità coinvolta (es. 'user', 'order', 'product')
   */
  @Column({ nullable: true })
  entityType: string;

  /**
   * ID dell'entità coinvolta
   */
  @Column({ nullable: true })
  @Index()
  entityId: string;

  /**
   * Descrizione human-readable dell'azione
   */
  @Column({ type: 'text' })
  description: string;

  /**
   * Dati prima della modifica (per audit trail completo)
   */
  @Column({ type: 'jsonb', nullable: true })
  previousData: Record<string, any>;

  /**
   * Dati dopo la modifica
   */
  @Column({ type: 'jsonb', nullable: true })
  newData: Record<string, any>;

  /**
   * Metadati aggiuntivi (endpoint, query params, etc.)
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    endpoint?: string;
    method?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    duration?: number;
    [key: string]: any;
  };

  /**
   * IP address dell'admin
   */
  @Column({ nullable: true })
  ipAddress: string;

  /**
   * User agent del browser
   */
  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  // ===========================
  // HELPER METHODS
  // ===========================

  /**
   * Formatta l'audit log per visualizzazione
   */
  toReadableFormat(): string {
    const timestamp = this.createdAt.toLocaleString('it-IT');
    const admin = this.adminEmail || 'Sistema';
    return `[${timestamp}] ${admin}: ${this.description}`;
  }

  /**
   * Verifica se l'azione è critica
   */
  isCritical(): boolean {
    return this.severity === AuditSeverity.CRITICAL;
  }

  /**
   * Ottieni la differenza tra dati prima e dopo
   */
  getDiff(): Record<string, { before: any; after: any }> | null {
    if (!this.previousData || !this.newData) return null;

    const diff: Record<string, { before: any; after: any }> = {};

    const allKeys = new Set([
      ...Object.keys(this.previousData),
      ...Object.keys(this.newData),
    ]);

    for (const key of allKeys) {
      const before = this.previousData[key];
      const after = this.newData[key];

      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diff[key] = { before, after };
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }
}
