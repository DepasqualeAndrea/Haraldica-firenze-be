import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ProductsAdminService } from './products-admin.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  AdminProductListResponseDto,
  ProductFilterDto,
  BulkUpdateProductsDto,
  CreateVariantDto,
  UpdateVariantDto,
  UpdateVariantStockDto,
  VariantResponseDto,
} from './dto/product.dto';
import { RequireAdmin } from 'src/common/guards/flexible-auth.guard';

@ApiTags('Products - Admin')
@Controller('admin/products')
@RequireAdmin()

@ApiBearerAuth()
export class ProductsAdminController {
  constructor(private readonly productsService: ProductsAdminService) {}

  // ===========================
  // 📦 CRUD PRODOTTI BASE
  // ===========================

  /**
   * 📋 GET /admin/products
   * Lista prodotti admin con filtri avanzati
   */
  @Get()
  @ApiOperation({ 
    summary: 'Lista prodotti (Admin)',
    description: 'Visualizza tutti i prodotti con filtri e paginazione, include prodotti inattivi'
  })
  @ApiResponse({ status: HttpStatus.OK, type: AdminProductListResponseDto })
  @ApiQuery({ name: 'query', required: false, description: 'Ricerca testuale' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Include prodotti disattivati' })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean, description: 'Solo prodotti con stock basso' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['price', 'name', 'stock', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async listProducts(
    @Query(new ValidationPipe({ transform: true })) filters: ProductFilterDto
  ): Promise<AdminProductListResponseDto> {
    return this.productsService.findAll(filters);
  }

  /**
   * 🔍 GET /admin/products/:id
   * Dettaglio prodotto completo
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Dettaglio prodotto (Admin)',
    description: 'Visualizza tutti i dettagli del prodotto inclusi dati admin'
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProductResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prodotto non trovato' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  async getProduct(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ProductResponseDto> {
    return this.productsService.findOneDetailed(id);
  }

  /**
   * ➕ POST /admin/products
   * Crea nuovo prodotto
   */
  @Post()
  @ApiOperation({ 
    summary: 'Crea prodotto (Admin)',
    description: 'Crea nuovo prodotto con integrazione Stripe automatica'
  })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Prodotto creato con successo', 
    type: ProductResponseDto 
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Dati non validi' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'SKU duplicato' })
  @ApiBody({ type: CreateProductDto })
  async createProduct(
    @Body(new ValidationPipe({ transform: true })) createDto: CreateProductDto
  ): Promise<ProductResponseDto> {
    return this.productsService.createProduct(createDto);
  }

  /**
   * ✏️ PUT /admin/products/:id
   * Modifica prodotto
   */
  @Put(':id')
  @ApiOperation({ 
    summary: 'Modifica prodotto (Admin)',
    description: 'Aggiorna dati prodotto esistente'
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Prodotto aggiornato', 
    type: ProductResponseDto 
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prodotto non trovato' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Dati non validi' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiBody({ type: UpdateProductDto })
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true })) updateDto: UpdateProductDto
  ): Promise<ProductResponseDto> {
    return this.productsService.updateProduct(id, updateDto);
  }

  /**
   * 🗑️ DELETE /admin/products/:id
   * Elimina prodotto (soft delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Elimina prodotto (Admin)',
    description: 'Disattiva prodotto (soft delete), non rimuove dal database'
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Prodotto disattivato' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prodotto non trovato' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  async deleteProduct(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.deleteProduct(id);
  }

  // ===========================
  // 🎨 GESTIONE VARIANTI
  // ===========================

  @Get(':id/variants')
  @ApiOperation({ summary: 'Lista varianti prodotto (Admin)' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiResponse({ status: HttpStatus.OK, type: [VariantResponseDto] })
  async listVariants(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<VariantResponseDto[]> {
    return this.productsService.listVariants(id);
  }

  @Post(':id/variants')
  @ApiOperation({ summary: 'Crea variante prodotto (Admin)' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiBody({ type: CreateVariantDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: VariantResponseDto })
  async createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true })) dto: CreateVariantDto
  ): Promise<VariantResponseDto> {
    return this.productsService.createVariant(id, dto);
  }

  @Put(':id/variants/:vid')
  @ApiOperation({ summary: 'Aggiorna variante prodotto (Admin)' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiParam({ name: 'vid', description: 'UUID della variante' })
  @ApiBody({ type: UpdateVariantDto })
  @ApiResponse({ status: HttpStatus.OK, type: VariantResponseDto })
  async updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateVariantDto
  ): Promise<VariantResponseDto> {
    return this.productsService.updateVariant(id, vid, dto);
  }

  @Delete(':id/variants/:vid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina variante prodotto (Admin)' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiParam({ name: 'vid', description: 'UUID della variante' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async deleteVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string
  ): Promise<void> {
    return this.productsService.deleteVariant(id, vid);
  }

  @Put(':id/variants/:vid/stock')
  @ApiOperation({ summary: 'Aggiorna stock variante (Admin)', description: 'Operazioni: set, add, subtract' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiParam({ name: 'vid', description: 'UUID della variante' })
  @ApiBody({ type: UpdateVariantStockDto })
  @ApiResponse({ status: HttpStatus.OK, type: VariantResponseDto })
  async updateVariantStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateVariantStockDto
  ): Promise<VariantResponseDto> {
    return this.productsService.updateVariantStock(id, vid, dto);
  }

  // ===========================
  // 🎯 PUBBLICAZIONE
  // ===========================

  /**
   * 👁️ PUT /admin/products/:id/publish
   * Pubblica/Nascondi prodotto
   */
  @Put(':id/publish')
  @ApiOperation({ 
    summary: 'Pubblica/Nascondi prodotto (Admin)',
    description: 'Attiva o disattiva visibilità pubblica del prodotto'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stato pubblicazione aggiornato' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isActive: { type: 'boolean', description: 'true = pubblico, false = nascosto' }
      },
      required: ['isActive']
    }
  })
  async togglePublish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean
  ) {
    const updateDto: UpdateProductDto = { isActive };
    const product = await this.productsService.updateProduct(id, updateDto);
    return {
      id: product.id,
      name: product.name,
      isActive: product.isActive,
      message: isActive ? 'Prodotto pubblicato' : 'Prodotto nascosto'
    };
  }

  /**
   * ⭐ PUT /admin/products/:id/featured
   * Segna prodotto in evidenza
   */
  @Put(':id/featured')
  @ApiOperation({ 
    summary: 'Imposta prodotto in evidenza (Admin)',
    description: 'Aggiungi o rimuovi prodotto dalla sezione featured'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Featured status aggiornato' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isFeatured: { type: 'boolean' }
      },
      required: ['isFeatured']
    }
  })
  async toggleFeatured(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isFeatured') isFeatured: boolean
  ) {
    const updateDto: UpdateProductDto = { isFeatured };
    const product = await this.productsService.updateProduct(id, updateDto);
    return {
      id: product.id,
      name: product.name,
      isFeatured: product.isFeatured,
      message: isFeatured ? 'Prodotto aggiunto ai featured' : 'Prodotto rimosso dai featured'
    };
  }


  // ===========================
  // 📊 STATISTICHE E DASHBOARD
  // ===========================

  /**
   * 📈 GET /admin/products/stats/dashboard
   * Statistiche dashboard
   */
  @Get('stats/dashboard')
  @ApiOperation({ 
    summary: 'Statistiche prodotti (Admin)',
    description: 'Metriche generali per dashboard admin'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Statistiche prodotti' })
  async getDashboardStats() {
    return this.productsService.getDashboardStats();
  }

  /**
   * 🔝 GET /admin/products/reports/best-sellers
   * Top prodotti più venduti
   */
  @Get('reports/best-sellers')
  @ApiOperation({ 
    summary: 'Best sellers report (Admin)',
    description: 'Top 10 prodotti più venduti'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Best sellers' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero prodotti (default: 10)' })
  async getBestSellers(@Query('limit') limit?: number) {
    const products = await this.productsService.getPopularProducts(limit || 10, 'all');
    return {
      products,
      total: products.length,
      generated_at: new Date()
    };
  }
}