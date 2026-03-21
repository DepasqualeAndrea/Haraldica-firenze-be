import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  BadRequestException
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiExcludeEndpoint
} from '@nestjs/swagger';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';
import { InventoryService } from './inventory.service';
import { UpdateStockInventroryDto } from './dto/update-stock.dto';
import { StockMovementFilterDto } from './dto/stock-movement.dto';
import { InventoryMovementType } from 'src/database/entities/inventory-movement.entity';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from 'src/database/entities/user.entity';

@ApiTags('Inventory')
@Controller('inventory')
@RequireAdmin()
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ===========================
  // STOCK MANAGEMENT (PRODUCT)
  // ===========================

  @Put('product/:productId/stock')
  @ApiOperation({
    summary: 'Aggiorna stock prodotto (Admin)',
    description: 'Aggiorna lo stock di un prodotto registrando il movimento inventariale'
  })
  async updateProductStock(
    @Param('productId') productId: string,
    @Body() updateStockDto: UpdateStockInventroryDto,
    @CurrentUser() user: any
  ) {
    return this.inventoryService.updateStock(productId, updateStockDto, user?.id);
  }

  @Get('product/:productId/validate/:quantity')
  @ApiOperation({
    summary: 'Valida disponibilità stock (Admin)',
    description: 'Verifica se c’è stock disponibile per la quantità richiesta'
  })
  async validateStockAvailability(
    @Param('productId') productId: string,
    @Param('quantity') quantity: number
  ) {
    return this.inventoryService.validateStockAvailability(productId, Number(quantity));
  }

  // ===========================
  // MOVEMENT TRACKING
  // ===========================

  @Get('movements')
  @ApiOperation({
    summary: 'Lista movimenti inventario (Admin)',
    description: 'Lista paginata di tutti i movimenti di stock con filtri'
  })
  @ApiQuery({ name: 'productId', required: false, description: 'ID prodotto' })
  @ApiQuery({ name: 'movementType', required: false, enum: InventoryMovementType })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Data inizio (ISO)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Data fine (ISO)' })
  @ApiQuery({ name: 'userId', required: false, description: 'ID utente' })
  @ApiQuery({ name: 'batchNumber', required: false, description: 'Numero lotto' })
  @ApiQuery({ name: 'orderId', required: false, description: 'ID ordine associato' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  async getAllMovements(@Query() filterDto: StockMovementFilterDto) {
    return this.inventoryService.getAllMovements(filterDto);
  }

  @Get('product/:productId/movements')
  @ApiOperation({
    summary: 'Movimenti di un prodotto (Admin)',
    description: 'Storico movimenti per un prodotto'
  })
  async getProductMovements(
    @Param('productId') productId: string,
    @Query() filterDto: StockMovementFilterDto
  ) {
    return this.inventoryService.getVariantMovements(productId, filterDto);
  }

  // ===========================
  // ALERTS & MONITORING
  // ===========================

  @Get('low-stock')
  @ApiOperation({
    summary: 'Prodotti con stock basso (Admin)',
    description: 'Elenco prodotti sotto la soglia minima configurata'
  })
  async getLowStockProducts() {
    // Il servizio non espone direttamente getLowStockProducts pubblica,
    // quindi usiamo le stats che includono lowStockProducts.
    const stats = await this.inventoryService.getInventoryStats();
    return { lowStockProducts: (stats as any).lowStockProducts || [] };
  }

  @Get('alerts/expiring')
  @ApiOperation({
    summary: 'Prodotti in scadenza (Admin)',
    description: 'Placeholder: logica di individuazione prodotti prossimi alla scadenza'
  })
  async getExpiringProducts(@Query('days') days: number = 30) {
    throw new BadRequestException('Funzionalità in sviluppo');
  }

  // ===========================
  // ANALYTICS & REPORTS
  // ===========================

  @Get('value')
  @ApiOperation({
    summary: 'Valore totale inventario (Admin)',
    description: 'Calcolo del valore totale dell’inventario usando i costi unitari più recenti'
  })
  async getInventoryValue() {
    return this.inventoryService.getInventoryValue();
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Statistiche inventario (Admin)',
    description: 'Dashboard con metriche e movimenti recenti'
  })
  async getInventoryStats() {
    return this.inventoryService.getInventoryStats();
  }

  @Get('reports/movements-summary')
  @ApiOperation({
    summary: 'Riepilogo movimenti (Admin)',
    description: 'Raggruppamento movimenti per tipo/periodo (in sviluppo)'
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async getMovementsSummary(
    @Query('dateFrom') _dateFrom?: string,
    @Query('dateTo') _dateTo?: string
  ) {
    throw new BadRequestException('Report in sviluppo');
  }

  // ===========================
  // SPECIAL MOVEMENTS (PRODUCT)
  // ===========================

  @Post('product/:productId/damage')
  @ApiOperation({
    summary: 'Registra merce danneggiata (Admin)',
    description: 'Crea movimento inventariale di tipo DAMAGE'
  })
  async recordDamage(
    @Param('productId') productId: string,
    @Body() damageDto: { quantity: number; reason: string; notes?: string },
    @CurrentUser() user: any
  ) {
    return this.inventoryService.recordDamageMovement(
      productId,
      damageDto.quantity,
      damageDto.reason,
      user?.id
    );
  }

  // ===========================
  // INTEGRATION ENDPOINTS (ORDERS)
  // ===========================

  @Post('internal/sale')
  @ApiOperation({
    summary: 'Registra vendita (Interno)',
    description: 'Endpoint interno usato dal modulo ordini per movimento SALE'
  })
  @ApiExcludeEndpoint()
  async recordSaleInternal(
    @Body() saleDto: { productId: string; quantity: number; orderId?: string; userId?: string }
  ) {
    return this.inventoryService.recordSaleMovement(
      saleDto.productId,
      saleDto.quantity,
      saleDto.orderId,
      saleDto.userId
    );
  }

  @Post('internal/return')
  @ApiOperation({
    summary: 'Registra reso (Interno)',
    description: 'Endpoint interno per movimento RETURN'
  })
  @ApiExcludeEndpoint()
  async recordReturnInternal(
    @Body() returnDto: { productId: string; quantity: number; orderId?: string; userId?: string }
  ) {
    return this.inventoryService.recordReturnMovement(
      returnDto.productId,
      returnDto.quantity,
      returnDto.orderId,
      returnDto.userId
    );
  }

  // ===========================
  // EXPORT / PLACEHOLDERS
  // ===========================

  @Get('export/movements')
  @ApiOperation({
    summary: 'Esporta movimenti (Admin)',
    description: 'Export CSV movimenti inventario (in sviluppo)'
  })
  async exportMovements(@Query() _filter: StockMovementFilterDto) {
    throw new BadRequestException('Export in sviluppo');
  }
}