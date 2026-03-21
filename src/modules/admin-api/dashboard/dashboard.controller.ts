import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

// Guards & Decorators
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';

// Service & DTOs
import { DashboardService } from './dashboard.service';
import { DashboardFilterDto, DashboardStatsDto } from './dto/dashboard.dto';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@RequireAdmin()

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /admin/dashboard/stats
   * Statistiche dashboard in tempo reale
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Statistiche dashboard',
    description: 'Ottieni statistiche complete per dashboard admin: ordini, spedizioni, revenue, azioni richieste',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiche recuperate con successo',
    type: DashboardStatsDto,
  })
  async getStats(@Query() filters?: DashboardFilterDto): Promise<DashboardStatsDto> {
    return this.dashboardService.getDashboardStats(filters);
  }
}
