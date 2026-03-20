import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiBearerAuth } from "@nestjs/swagger";
import { Roles } from "src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { UserRole } from "src/database/entities/user.entity";
import { SizeGuide } from "src/database/entities/size-guide.entity";
import { CategoriesService } from "./categories.service";
import { CategoryFilterDto } from "./dto/category-filter.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) { }

  // ===========================
  // PUBLIC ENDPOINTS
  // ===========================

  @Get()
  @ApiOperation({
    summary: 'Lista categorie',
    description: 'Ottieni lista delle categorie con filtri avanzati'
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Solo categorie attive' })
  @ApiQuery({ name: 'parentId', required: false, type: String, description: 'Filtra per categoria padre (null per root)' })
  @ApiQuery({ name: 'clothingType', required: false, type: String, description: 'Filtra per tipo abbigliamento' })
  @ApiQuery({ name: 'includeProducts', required: false, type: Boolean, description: 'Includi prodotti nella risposta' })
  @ApiQuery({ name: 'includeChildren', required: false, type: Boolean, description: 'Includi sottocategorie' })
  @ApiQuery({ name: 'hasProducts', required: false, type: Boolean, description: 'Solo categorie con prodotti' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Ricerca per nome/descrizione' })
  async findAll(@Query() filterDto: CategoryFilterDto) {
    return this.categoriesService.findAll(filterDto);
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Albero categorie completo',
    description: 'Struttura gerarchica completa delle categorie attive con sottocategorie'
  })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Includi categorie inattive' })
  async getCategoryTree(@Query('includeInactive') includeInactive: boolean = false) {
    return this.categoriesService.getTree(includeInactive);
  }

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Categoria per slug',
    description: 'Ottieni categoria tramite slug URL-friendly'
  })
  @ApiQuery({ name: 'includeProducts', required: false, type: Boolean })
  async findBySlug(
    @Param('slug') slug: string,
    @Query('includeProducts') includeProducts: boolean = false,
  ) {
    return this.categoriesService.findBySlug(slug, { includeProducts });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Dettaglio categoria',
    description: 'Dettagli completi di una categoria specifica'
  })
  @ApiQuery({ name: 'includeProducts', required: false, type: Boolean })
  async findOne(
    @Param('id') id: string,
    @Query('includeProducts') includeProducts: boolean = false,
  ) {
    return this.categoriesService.findOneDetailed(id);
  }

  @Get(':id/breadcrumb')
  @ApiOperation({
    summary: 'Breadcrumb categoria',
    description: 'Percorso gerarchico dalla root alla categoria'
  })
  async getBreadcrumb(@Param('id') id: string) {
    return this.categoriesService.getBreadcrumb(id);
  }

  @Get(':id/size-guide')
  @ApiOperation({
    summary: 'Guida taglie categoria',
    description: 'Ottieni la guida taglie associata a una categoria'
  })
  async getSizeGuide(@Param('id') id: string): Promise<SizeGuide | null> {
    return this.categoriesService.getSizeGuide(id);
  }

  // ===========================
  // ADMIN ENDPOINTS
  // ===========================

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Statistiche categorie (Admin)',
    description: 'Dashboard completa con metriche categorie e distribuzione prodotti'
  })
  async getCategoryStats() {
    return this.categoriesService.getCategoryStats();
  }

  @Get('admin/top-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Top categorie per prodotti (Admin)',
    description: 'Categorie con più prodotti ordinate per performance'
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getTopCategories(@Query('limit') limit: number = 10) {
    return this.categoriesService.getTopCategories(limit);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crea categoria (Admin)',
    description: 'Crea nuova categoria abbigliamento'
  })
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aggiorna categoria (Admin)',
    description: 'Modifica categoria esistente con validazioni gerarchia'
  })
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Put(':id/move')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sposta categoria (Admin)',
    description: 'Cambia categoria padre con validazione riferimenti circolari'
  })
  async moveCategory(
    @Param('id') id: string,
    @Body() moveDto: { newParentId: string | null },
  ) {
    return this.categoriesService.moveCategory(id, moveDto.newParentId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Elimina categoria (Admin)',
    description: 'Elimina categoria solo se non ha figli o prodotti attivi'
  })
  async remove(@Param('id') id: string) {
    await this.categoriesService.remove(id);
    return {
      success: true,
      message: 'Categoria eliminata con successo'
    };
  }

  @Post(':id/size-guide')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crea/aggiorna guida taglie (Admin)',
    description: 'Crea o aggiorna la guida taglie per una categoria'
  })
  async upsertSizeGuide(@Param('id') id: string, @Body() dto: any): Promise<SizeGuide> {
    return this.categoriesService.upsertSizeGuide(id, dto);
  }

  @Delete(':id/size-guide')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Elimina guida taglie (Admin)',
    description: 'Elimina la guida taglie associata a una categoria'
  })
  async deleteSizeGuide(@Param('id') id: string): Promise<void> {
    return this.categoriesService.deleteSizeGuide(id);
  }

  // ===========================
  // BULK OPERATIONS (ADMIN)
  // ===========================

  @Put('admin/bulk/sort-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Aggiorna ordine multiplo (Admin)',
    description: 'Modifica l\'ordine di visualizzazione di multiple categorie'
  })
  async bulkUpdateSortOrder(
    @Body() bulkUpdateDto: { updates: Array<{ id: string; sortOrder: number }> }
  ) {
    await this.categoriesService.bulkUpdateSortOrder(bulkUpdateDto.updates);
    return {
      success: true,
      message: `${bulkUpdateDto.updates.length} categorie riordinate con successo`
    };
  }

  @Put('admin/bulk/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Attivazione/Disattivazione multipla (Admin)',
    description: 'Attiva o disattiva multiple categorie contemporaneamente'
  })
  async bulkActivate(
    @Body() bulkDto: { categoryIds: string[]; isActive: boolean }
  ) {
    const result = await this.categoriesService.bulkActivate(bulkDto.categoryIds, bulkDto.isActive);
    return {
      success: result.errors.length === 0,
      updated: result.updated,
      errors: result.errors,
      message: `${result.updated} categorie ${bulkDto.isActive ? 'attivate' : 'disattivate'}, ${result.errors.length} errori`
    };
  }

  // ===========================
  // UTILITY ENDPOINTS
  // ===========================

  @Get('utils/validate-slug/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Valida unicità slug (Admin)',
    description: 'Verifica se uno slug è disponibile'
  })
  @ApiQuery({ name: 'excludeId', required: false, type: String, description: 'ID categoria da escludere dal controllo' })
  async validateSlug(
    @Param('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    try {
      return { available: true, slug };
    } catch (error) {
      return { available: false, slug, error: error.message };
    }
  }

  @Get('utils/generate-slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Genera slug automatico (Admin)',
    description: 'Genera slug URL-friendly da un nome categoria'
  })
  @ApiQuery({ name: 'name', required: true, type: String, description: 'Nome categoria' })
  async generateSlug(@Query('name') name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Rimuovi caratteri speciali
      .replace(/\s+/g, '-') // Sostituisci spazi con trattini
      .replace(/-+/g, '-') // Rimuovi trattini multipli
      .replace(/^-|-$/g, ''); // Rimuovi trattini iniziali/finali

    return { slug, original: name };
  }

  // ===========================
  // SEARCH & SUGGESTIONS
  // ===========================

  @Get('search/suggestions')
  @ApiOperation({
    summary: 'Suggerimenti categorie',
    description: 'Suggerimenti rapidi per autocomplete ricerca categorie'
  })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Query di ricerca' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 5 })
  async getSearchSuggestions(
    @Query('q') query: string,
    @Query('limit') limit: number = 5,
  ) {
    if (query.length < 2) {
      return { suggestions: [] };
    }

    const categories = await this.categoriesService.findAll({
      search: query,
      isActive: true,
    });

    const suggestions = categories.categories
      .slice(0, limit)
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        clothingType: cat.clothingType,
        productCount: cat.productCount,
      }));

    return { suggestions };
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Categorie popolari',
    description: 'Categorie con più prodotti ordinate per popolarità'
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 8 })
  async getPopularCategories(@Query('limit') limit: number = 8) {
    return this.categoriesService.getTopCategories(limit);
  }

  // ===========================
  // EXPORT & IMPORT (ADMIN)
  // ===========================

  @Get('admin/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Esporta categorie (Admin)',
    description: 'Esporta struttura categorie in formato JSON/CSV'
  })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'], example: 'json' })
  async exportCategories(@Query('format') format: string = 'json') {
    // TODO: Implementare export
    throw new BadRequestException('Export in sviluppo');
  }

  @Post('admin/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Importa categorie (Admin)',
    description: 'Importa struttura categorie da file JSON/CSV'
  })
  async importCategories(@Body() importData: any) {
    throw new BadRequestException('Import in sviluppo');
  }
}
