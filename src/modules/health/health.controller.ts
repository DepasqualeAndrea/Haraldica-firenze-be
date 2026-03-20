import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthCheckResult } from './health.service';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check generale (liveness probe)' })
  @ApiResponse({ status: 200, description: 'Servizio attivo' })
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - verifica dipendenze' })
  @ApiResponse({ status: 200, description: 'Servizio pronto' })
  @ApiResponse({ status: 503, description: 'Servizio non pronto' })
  async ready(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - verifica processo' })
  @ApiResponse({ status: 200, description: 'Processo vivo' })
  async live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        limit: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      cpu: process.cpuUsage(),
    };
  }
}
