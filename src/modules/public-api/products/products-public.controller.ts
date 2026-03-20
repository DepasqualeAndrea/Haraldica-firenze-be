import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  ValidationPipe
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { ProductListResponseDto, ProductFilterDto, PublicProductDetailDto } from './dto/product.dto';
import { ProductsPublicService } from './products-public.service';

@ApiTags('Products - Public API')
@Controller('products')
export class ProductsPublicController {
  constructor(private readonly service: ProductsPublicService) { }

  /**
   * 📦 GET /products
   * Lista prodotti con paginazione e filtri
   * Usato in: Homepage, Pagina catalogo
   */
  @Get()
  @ApiOperation({
    summary: 'Lista prodotti con filtri avanzati',
    description: 'Endpoint principale per catalogo prodotti con paginazione, ordinamento e filtri multipli'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista prodotti recuperata con successo',
    type: ProductListResponseDto
  })
  @ApiQuery({ name: 'query', required: false, description: 'Ricerca testuale su nome/descrizione/brand' })
  @ApiQuery({ name: 'categories', required: false, description: 'Filtro categorie (comma-separated)' })
  @ApiQuery({ name: 'brands', required: false, description: 'Filtro brand (comma-separated)' })
  @ApiQuery({ name: 'priceRange.min', required: false, type: Number, description: 'Prezzo minimo' })
  @ApiQuery({ name: 'priceRange.max', required: false, type: Number, description: 'Prezzo massimo' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numero pagina (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Prodotti per pagina (default: 20)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['price', 'name', 'createdAt', 'sales'], description: 'Campo ordinamento' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Direzione ordinamento' })
  @ApiQuery({ name: 'inStockOnly', required: false, type: Boolean, description: 'Solo disponibili in magazzino' })
  @ApiQuery({ name: 'featuredOnly', required: false, type: Boolean, description: 'Solo prodotti in evidenza' })
  @ApiQuery({ name: 'onSaleOnly', required: false, type: Boolean, description: 'Solo prodotti in offerta' })
  @ApiQuery({ name: 'minRating', required: false, type: Number, description: 'Rating minimo (1-5)' })
  async listProducts(
    @Query(new ValidationPipe({ transform: true })) filters: ProductFilterDto
  ) {
    return this.service.listProducts(filters);
  }

  /**
   * 🔍 GET /products/search
   * Ricerca avanzata prodotti
   * Usato in: Barra ricerca avanzata
   */
  @Get('search')
  @ApiOperation({
    summary: 'Ricerca avanzata prodotti',
    description: 'Ricerca con filtri complessi su tutti i campi'
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProductListResponseDto })
  async searchProducts(
    @Query(new ValidationPipe({ transform: true })) filters: ProductFilterDto
  ) {
    return this.service.advancedSearch(filters);
  }

  /**
   * 🌟 GET /products/featured
   * Prodotti in evidenza
   * Usato in: Homepage sezione "Prodotti in evidenza"
   */
  @Get('featured')
  @ApiOperation({
    summary: 'Prodotti in evidenza',
    description: 'Prodotti selezionati da mostrare in homepage'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Prodotti featured recuperati' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero prodotti (default: 8)' })
  async getFeatured(@Query('limit') limit?: number) {
    return this.service.getFeatured(limit || 8);
  }

  /**
   * 🎉 GET /products/on-sale
   * Prodotti in offerta
   * Usato in: Homepage sezione "Offerte", Pagina saldi
   */
  @Get('on-sale')
  @ApiOperation({
    summary: 'Prodotti in offerta',
    description: 'Prodotti attualmente scontati'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Prodotti in offerta' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero prodotti (default: 12)' })
  async getOnSale(@Query('limit') limit?: number) {
    return this.service.getOnSale(limit || 12);
  }

  /**
   * 🆕 GET /products/new-arrivals
   * Ultimi arrivi
   * Usato in: Homepage sezione "Novità"
   */
  @Get('new-arrivals')
  @ApiOperation({
    summary: 'Nuovi arrivi',
    description: 'Ultimi prodotti aggiunti al catalogo'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Nuovi prodotti' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero prodotti (default: 12)' })
  async getNewArrivals(@Query('limit') limit?: number) {
    return this.service.getNewArrivals(limit || 12);
  }

  /**
   * 🔥 GET /products/popular
   * Prodotti più popolari
   * Usato in: Homepage, Suggerimenti
   */
  @Get('popular')
  @ApiOperation({
    summary: 'Prodotti più popolari',
    description: 'Best sellers basati su vendite e rating'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Top prodotti' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero prodotti (default: 12)' })
  async getPopular(@Query('limit') limit?: number) {
    return this.service.getPopular(limit || 12);
  }

  /**
   * 📊 GET /products/trends
   * Analisi trend
   * Usato in: Dashboard, Analytics
   */
  @Get('trends')
  @ApiOperation({
    summary: 'Trend prodotti',
    description: 'Prodotti di tendenza nel periodo specificato'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Trending products' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year'], description: 'Periodo analisi' })
  async getTrends(
    @Query('period') period?: 'week' | 'month' | 'year'
  ) {
    return this.service.getTrends(period || 'month');
  }

  /**
   * 🏷️ GET /products/category/:cosmeticType
   * Prodotti per categoria cosmetica
   * Usato in: Pagina categoria
   */
  @Get('category/:cosmeticType')
  @ApiOperation({
    summary: 'Prodotti per categoria',
    description: 'Filtra prodotti per tipo cosmetico'
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProductListResponseDto })
  @ApiParam({ name: 'cosmeticType', description: 'Tipo categoria cosmetica' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getByCosmeticType(
    @Param('cosmeticType') cosmeticType: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.service.getByCosmeticType(cosmeticType, { page, limit });
  }

  /**
   * 🏢 GET /products/brand/:brand
   * Prodotti per brand (nota: monobrand, ma utile per filtro)
   * Usato in: Se necessario
   */
  @Get('brand/:brand')
  @ApiOperation({
    summary: 'Prodotti per brand',
    description: 'Filtra per nome brand'
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProductListResponseDto })
  @ApiParam({ name: 'brand', description: 'Nome brand' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getByBrand(
    @Param('brand') brand: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.service.getByBrand(brand, { page, limit });
  }

  /**
   * 🔗 GET /products/:id/related
   * Prodotti correlati
   * Usato in: Pagina prodotto, upselling
   */
  @Get(':id/related')
  @ApiOperation({
    summary: 'Prodotti correlati',
    description: 'Suggerimenti prodotti simili o complementari'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Related products' })
  @ApiParam({ name: 'id', description: 'ID prodotto' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Numero suggerimenti (default: 4)' })
  async getRelated(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number
  ) {
    return this.service.getRelated(id, limit || 4);
  }

  /**
   * 🎛️ GET /products/filters/available
   * Filtri disponibili
   * Usato in: Sidebar filtri catalogo
   */
  @Get('filters/available')
  @ApiOperation({
    summary: 'Opzioni filtri disponibili',
    description: 'Range prezzi, brand disponibili, feature flags'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Available filters' })
  async getAvailableFilters() {
    return this.service.getAvailableFilters();
  }

  /**
   * 🔗 GET /products/slug/:slug
   * Dettaglio prodotto tramite slug (SEO-friendly)
   * Usato in: URL prodotto SEO /products/crema-viso-idratante
   */
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Dettaglio prodotto per slug',
    description: 'Accesso SEO-friendly al prodotto'
  })
  @ApiResponse({ status: HttpStatus.OK, type: PublicProductDetailDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prodotto non trovato' })
  @ApiParam({ name: 'slug', description: 'Slug URL del prodotto' })
  async getBySlug(@Param('slug') slug: string) {
    return this.service.getProductBySlug(slug);
  }

  /**
   * 📋 GET /products/:id/availability
   * Verifica disponibilità prodotto
   * Usato in: Bottone "Aggiungi al carrello"
   */
  @Get(':id/availability')
  @ApiOperation({
    summary: 'Verifica disponibilità prodotto',
    description: 'Check stock in tempo reale'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Disponibilità prodotto',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        stock: { type: 'number' }
      }
    }
  })
  @ApiParam({ name: 'id', description: 'ID prodotto' })
  async checkAvailability(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.service.getProduct(id);
    return {
      available: product.stock > 0,
      stock: product.stock
    };
  }

  /**
   * 🖼️ GET /products/:id/images
   * Galleria immagini prodotto
   * Usato in: Carousel immagini pagina prodotto
   */
  @Get(':id/images')
  @ApiOperation({
    summary: 'Galleria immagini prodotto',
    description: 'Array di URL immagini ordinate'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Array immagini',
    schema: {
      type: 'array',
      items: { type: 'string' }
    }
  })
  @ApiParam({ name: 'id', description: 'ID prodotto' })
  async getImages(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.service.getProduct(id);
    return product.images || [];
  }

  /**
   * 🎯 GET /products/:id
   * Dettaglio completo prodotto
   * Usato in: Pagina prodotto
   * NOTA: Deve stare ALLA FINE per evitare conflitti con route statiche
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Dettaglio prodotto completo',
    description: 'Tutte le informazioni del prodotto incluse recensioni, ingredienti, FAQ'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Prodotto recuperato',
    type: PublicProductDetailDto
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prodotto non trovato' })
  @ApiParam({ name: 'id', description: 'UUID del prodotto' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProduct(id);
  }
}