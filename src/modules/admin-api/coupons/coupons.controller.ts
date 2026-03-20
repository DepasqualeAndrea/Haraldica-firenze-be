import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CouponsAdminService } from './coupons.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  CouponFilterDto,
  ValidateCouponDto,
  CouponValidationResultDto,
  CouponUsageSummaryDto,
  CouponResponseDto,
  PaginatedCouponsResponseDto,
  BulkCreateCouponsDto,
  BulkDeleteCouponsDto,
  CollaboratorStatsDto,
} from './dto/coupon.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/entities/user.entity';

@ApiTags('Admin - Coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@Roles(UserRole.ADMIN)
export class CouponsAdminController {
  constructor(private readonly couponsService: CouponsAdminService) {}

  // ==================== CRUD ====================

  @Post()
  @ApiOperation({ summary: 'Crea un nuovo coupon' })
  @ApiResponse({ status: 201, description: 'Coupon creato', type: CouponResponseDto })
  @ApiResponse({ status: 400, description: 'Dati non validi' })
  @ApiResponse({ status: 409, description: 'Codice coupon già esistente' })
  async create(@Body() dto: CreateCouponDto): Promise<CouponResponseDto> {
    return this.couponsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista tutti i coupon con filtri e paginazione' })
  @ApiResponse({ status: 200, description: 'Lista coupon', type: PaginatedCouponsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: ['percentage', 'fixed_amount', 'free_shipping'] })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive', 'expired'] })
  @ApiQuery({ name: 'collaborator', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async findAll(@Query() filter: CouponFilterDto): Promise<PaginatedCouponsResponseDto> {
    return this.couponsService.findAll(filter);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Statistiche dashboard coupon' })
  @ApiResponse({ status: 200, description: 'Statistiche dashboard' })
  async getDashboardStats() {
    return this.couponsService.getDashboardStats();
  }

  @Get('collaborators')
  @ApiOperation({ summary: 'Statistiche per collaboratore/influencer' })
  @ApiResponse({ status: 200, description: 'Lista statistiche collaboratori', type: [CollaboratorStatsDto] })
  async getCollaboratorStats(): Promise<CollaboratorStatsDto[]> {
    return this.couponsService.getCollaboratorStats();
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Trova coupon per codice' })
  @ApiParam({ name: 'code', description: 'Codice coupon (es. SUMMER20)' })
  @ApiResponse({ status: 200, description: 'Coupon trovato', type: CouponResponseDto })
  @ApiResponse({ status: 404, description: 'Coupon non trovato' })
  async findByCode(@Param('code') code: string): Promise<CouponResponseDto> {
    return this.couponsService.findByCode(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio coupon per ID' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Coupon trovato', type: CouponResponseDto })
  @ApiResponse({ status: 404, description: 'Coupon non trovato' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CouponResponseDto> {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna un coupon' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Coupon aggiornato', type: CouponResponseDto })
  @ApiResponse({ status: 404, description: 'Coupon non trovato' })
  @ApiResponse({ status: 409, description: 'Codice coupon già esistente' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un coupon (o disattiva se già usato)' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Coupon eliminato/disattivato' })
  @ApiResponse({ status: 404, description: 'Coupon non trovato' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponsService.delete(id);
  }

  // ==================== BULK OPERATIONS ====================

  @Post('bulk')
  @ApiOperation({ summary: 'Crea multipli coupon in una volta' })
  @ApiResponse({ status: 201, description: 'Risultato creazione bulk' })
  async bulkCreate(@Body() dto: BulkCreateCouponsDto) {
    return this.couponsService.bulkCreate(dto);
  }

  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina multipli coupon' })
  @ApiResponse({ status: 200, description: 'Risultato eliminazione bulk' })
  async bulkDelete(@Body() dto: BulkDeleteCouponsDto) {
    return this.couponsService.bulkDelete(dto);
  }

  // ==================== STATUS MANAGEMENT ====================

  @Post(':id/activate')
  @ApiOperation({ summary: 'Attiva un coupon' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Coupon attivato', type: CouponResponseDto })
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<CouponResponseDto> {
    return this.couponsService.activate(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Disattiva un coupon' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Coupon disattivato', type: CouponResponseDto })
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<CouponResponseDto> {
    return this.couponsService.deactivate(id);
  }

  // ==================== VALIDATION ====================

  @Post('validate')
  @ApiOperation({ summary: 'Valida un coupon con contesto ordine' })
  @ApiResponse({ status: 200, description: 'Risultato validazione', type: CouponValidationResultDto })
  async validate(@Body() dto: ValidateCouponDto): Promise<CouponValidationResultDto> {
    return this.couponsService.validate(dto);
  }

  // ==================== STATISTICS ====================

  @Get(':id/stats')
  @ApiOperation({ summary: 'Statistiche utilizzo di un coupon' })
  @ApiParam({ name: 'id', description: 'UUID del coupon' })
  @ApiResponse({ status: 200, description: 'Statistiche coupon', type: CouponUsageSummaryDto })
  @ApiResponse({ status: 404, description: 'Coupon non trovato' })
  async getStats(@Param('id', ParseUUIDPipe) id: string): Promise<CouponUsageSummaryDto> {
    return this.couponsService.getStats(id);
  }
}
