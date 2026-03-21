// src/modules/admin-api/newsletter/newsletter.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Guards & Decorators
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// Service & DTOs
import { NewsletterService } from './newsletter.service';
import {
  CreateNewsletterDto,
  UpdateNewsletterDto,
  NewsletterFilterDto,
} from './dto/create-newsletter.dto';

@ApiTags('Newsletter (Admin)')
@Controller('admin/newsletters')
@RequireAdmin()
@ApiBearerAuth()
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  // ===========================
  // CRUD ENDPOINTS
  // ===========================

  @Post()
  @ApiOperation({ summary: 'Crea nuova newsletter' })
  @ApiResponse({ status: 201, description: 'Newsletter creata' })
  async create(
    @Body() dto: CreateNewsletterDto,
    @CurrentUser() admin: any,
  ) {
    const newsletter = await this.newsletterService.create(dto, admin.id);
    return {
      success: true,
      message: 'Newsletter creata',
      newsletter,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lista tutte le newsletter' })
  @ApiResponse({ status: 200, description: 'Lista newsletter' })
  async findAll(@Query() filter: NewsletterFilterDto) {
    const result = await this.newsletterService.findAll(filter);
    return {
      success: true,
      ...result,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Statistiche newsletter' })
  @ApiResponse({ status: 200, description: 'Statistiche globali' })
  async getStats() {
    const stats = await this.newsletterService.getStats();
    return {
      success: true,
      stats,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio newsletter' })
  @ApiResponse({ status: 200, description: 'Newsletter trovata' })
  @ApiResponse({ status: 404, description: 'Newsletter non trovata' })
  async findOne(@Param('id') id: string) {
    const newsletter = await this.newsletterService.findById(id);
    return {
      success: true,
      newsletter,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna newsletter' })
  @ApiResponse({ status: 200, description: 'Newsletter aggiornata' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNewsletterDto,
  ) {
    const newsletter = await this.newsletterService.update(id, dto);
    return {
      success: true,
      message: 'Newsletter aggiornata',
      newsletter,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina newsletter' })
  @ApiResponse({ status: 200, description: 'Newsletter eliminata' })
  async delete(@Param('id') id: string) {
    await this.newsletterService.delete(id);
    return {
      success: true,
      message: 'Newsletter eliminata',
    };
  }

  // ===========================
  // SEND & SCHEDULE
  // ===========================

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invia newsletter immediatamente' })
  @ApiResponse({ status: 200, description: 'Newsletter inviata' })
  async sendNow(@Param('id') id: string) {
    const newsletter = await this.newsletterService.sendNow(id);
    return {
      success: true,
      message: `Newsletter inviata a ${newsletter.recipientCount} destinatari`,
      newsletter,
    };
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Programma invio newsletter' })
  @ApiResponse({ status: 200, description: 'Newsletter programmata' })
  async schedule(
    @Param('id') id: string,
    @Body('scheduledAt') scheduledAt: string,
  ) {
    const newsletter = await this.newsletterService.schedule(
      id,
      new Date(scheduledAt),
    );
    return {
      success: true,
      message: `Newsletter programmata per ${newsletter.scheduledAt}`,
      newsletter,
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annulla invio programmato' })
  @ApiResponse({ status: 200, description: 'Invio annullato' })
  async cancel(@Param('id') id: string) {
    const newsletter = await this.newsletterService.cancel(id);
    return {
      success: true,
      message: 'Invio annullato',
      newsletter,
    };
  }

  // ===========================
  // PREVIEW
  // ===========================

  @Get(':id/recipients-count')
  @ApiOperation({ summary: 'Conta destinatari per anteprima' })
  @ApiResponse({ status: 200, description: 'Conteggio destinatari' })
  async getRecipientsCount(@Param('id') id: string) {
    const count = await this.newsletterService.getRecipientsCount(id);
    return {
      success: true,
      recipientsCount: count,
    };
  }
}
