import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics-query.dto';
import { SalesReportDto } from './dto/sales-report.dto';

@ApiTags('analytics')
@Controller('analytics')
@RequireAdmin()

@ApiBearerAuth()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard statistiche generali (Admin)' })
  @ApiQuery({ name: 'period', required: false, enum: AnalyticsPeriod })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getDashboardStats(@Query() queryDto: AnalyticsQueryDto) {
    return this.analyticsService.getDashboardStats(queryDto);
  }

  @Get('sales-report')
  @ApiOperation({ summary: 'Report vendite dettagliato (Admin)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'groupBy',
    required: false,
    enum: ['day', 'week', 'month', 'product', 'category'],
  })
  async getSalesReport(@Query() reportDto: SalesReportDto) {
    return this.analyticsService.getSalesReport(reportDto);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Analytics clienti (Admin)' })
  @ApiQuery({ name: 'period', required: false, enum: AnalyticsPeriod })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getCustomerAnalytics(@Query() queryDto: AnalyticsQueryDto) {
    return this.analyticsService.getCustomerAnalytics(queryDto);
  }

  @Get('variant/:variantId')
  @ApiOperation({ summary: 'Analytics specifica variante prodotto (Admin)' })
  @ApiQuery({ name: 'period', required: false, enum: AnalyticsPeriod })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getVariantAnalytics(
    @Param('variantId') variantId: string,
    @Query() queryDto: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getVariantAnalytics(variantId, queryDto);
  }
}
