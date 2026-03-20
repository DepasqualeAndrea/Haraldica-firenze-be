// src/common/audit/audit-log.controller.ts

import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/entities/user.entity';
import { AuditLogService, AuditLogFilterDto } from './audit-log.service';
import { AuditAction, AuditSeverity } from 'src/database/entities/audit-log.entity';

@ApiTags('Audit Logs (Admin)')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'Lista audit logs con filtri' })
  @ApiQuery({ name: 'adminId', required: false })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'severity', required: false, enum: AuditSeverity })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista audit logs paginata' })
  async findAll(@Query() filter: AuditLogFilterDto) {
    const result = await this.auditLogService.findAll(filter);
    return {
      success: true,
      ...result,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiche audit logs' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Statistiche globali' })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const stats = await this.auditLogService.getStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return {
      success: true,
      stats,
    };
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Audit logs per specifica entità' })
  @ApiResponse({ status: 200, description: 'Audit logs entità' })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    const logs = await this.auditLogService.findByEntity(entityType, entityId);
    return {
      success: true,
      logs,
      total: logs.length,
    };
  }

  @Get('actions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista tutte le azioni disponibili' })
  @ApiResponse({ status: 200, description: 'Lista azioni' })
  async getActions() {
    return {
      success: true,
      actions: Object.values(AuditAction),
      severities: Object.values(AuditSeverity),
    };
  }
}
