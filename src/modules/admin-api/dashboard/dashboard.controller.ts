import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

// Guards & Decorators
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/entities/user.entity';

// Service & DTOs
import { DashboardService } from './dashboard.service';
import { DashboardFilterDto, DashboardStatsDto } from './dto/dashboard.dto';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
