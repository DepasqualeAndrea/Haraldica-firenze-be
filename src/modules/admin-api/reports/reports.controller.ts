import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';
import { ReportsService } from './reports.service';
import { ReportFilterDto, ReportFormat } from './dto/report.dto';
import { Readable } from 'stream';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@Controller('admin/reports')
@RequireAdmin()
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reportsService: ReportsService) {}

  @Get('accounting')
  @ApiOperation({ summary: 'Genera report contabile per il commercialista' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inizio (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data fine (ISO 8601)' })
  @ApiQuery({ name: 'format', required: false, enum: ReportFormat, description: 'Formato output' })
  async getAccountingReport(
    @Query() filters: ReportFilterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(`📊 Richiesta report contabile - Format: ${filters.format}`);

    try {
      switch (filters.format) {
        case ReportFormat.PDF:
          const pdfBuffer = await this.reportsService.generateAccountingPdf(filters);
          const pdfFilename = `report-contabile-${this.getDateRange(filters)}.pdf`;

          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${pdfFilename}"`,
          });

          // Converti il buffer in un stream
          const pdfStream = Readable.from(pdfBuffer);
          return new StreamableFile(pdfStream);

        case ReportFormat.CSV:
          const csvContent = await this.reportsService.generateAccountingCsv(filters);
          const csvFilename = `report-contabile-${this.getDateRange(filters)}.csv`;

          res.set({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${csvFilename}"`,
          });

          // Converti il CSV string in un stream
          const csvStream = Readable.from(csvContent);
          return new StreamableFile(csvStream);

        case ReportFormat.JSON:
        default:
          const data = await this.reportsService.generateAccountingReport(filters);
          return data;
      }
    } catch (error) {
      this.logger.error(`❌ Errore generazione report: ${error.message}`);
      throw error;
    }
  }

  @Get('accounting/preview')
  @ApiOperation({ summary: 'Preview dati report (JSON)' })
  async previewAccountingReport(@Query() filters: ReportFilterDto) {
    return this.reportsService.generateAccountingReport(filters);
  }

  private getDateRange(filters: ReportFilterDto): string {
    const start = filters.startDate
      ? new Date(filters.startDate).toISOString().split('T')[0]
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split('T')[0];

    const end = filters.endDate
      ? new Date(filters.endDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return `${start}_${end}`;
  }
}
