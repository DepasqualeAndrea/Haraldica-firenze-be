import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { Roles } from "src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { UserRole } from "src/database/entities/user.entity";
import { BulkReviewActionDto } from "./dto/bulk-operations.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ReviewFilterDto } from "./dto/review-filter.dto";
import { ReviewVoteDto } from "./dto/review-vote.dto";
import { StoreResponseDto } from "./dto/store-response.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { ReviewsService } from "./reviews.service";

@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  // ===========================
  // PUBLIC ENDPOINTS
  // ===========================

  @Get()
  @ApiOperation({ 
    summary: 'Lista recensioni pubbliche',
    description: 'Ottieni lista paginata di recensioni con filtri. Solo recensioni approvate per default.'
  })
  @ApiQuery({ name: 'productId', required: false, description: 'Filtra per ID prodotto' })
  @ApiQuery({ name: 'minRating', required: false, type: Number, description: 'Rating minimo (1-5)' })
  @ApiQuery({ name: 'maxRating', required: false, type: Number, description: 'Rating massimo (1-5)' })
  @ApiQuery({ name: 'hasImages', required: false, type: Boolean, description: 'Solo con immagini' })
  @ApiQuery({ name: 'hasStoreResponse', required: false, type: Boolean, description: 'Solo con risposta negozio' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['newest', 'oldest', 'highest_rating', 'lowest_rating', 'most_helpful'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Numero risultati per pagina' })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0, description: 'Offset per paginazione' })
  async findAll(@Query() filterDto: ReviewFilterDto) {
    return this.reviewsService.findAll(filterDto);
  }

  @Get('product/:productId')
  @ApiOperation({ 
    summary: 'Recensioni di un prodotto',
    description: 'Tutte le recensioni approvate per uno specifico prodotto con statistiche'
  })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['newest', 'oldest', 'highest_rating', 'lowest_rating', 'most_helpful'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getProductReviews(
    @Param('productId') productId: string,
    @Query() filterDto: ReviewFilterDto,
  ) {
    return this.reviewsService.findByProduct(productId, filterDto);
  }

  @Get('product/:productId/stats')
  @ApiOperation({ 
    summary: 'Statistiche recensioni prodotto',
    description: 'Media rating, distribuzione stelle, percentuali e metriche del prodotto'
  })
  async getProductRatingStats(@Param('productId') productId: string) {
    return this.reviewsService.getProductRatingStats(productId);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Dettaglio recensione',
    description: 'Dettagli completi di una recensione specifica'
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.findOneDetailed(id);
  }

  // ===========================
  // USER AUTHENTICATED ENDPOINTS
  // ===========================

  @Get('me/eligible-products')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Prodotti recensibili',
    description: 'Lista dei prodotti che l\'utente può recensire (acquistati ma non ancora recensiti)'
  })
  async getEligibleProducts(@CurrentUser() user: any) {
    return this.reviewsService.getUserEligibleProducts(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Le mie recensioni',
    description: 'Tutte le recensioni dell\'utente corrente (incluse quelle non approvate)'
  })
  async getMyReviews(@CurrentUser() user: any) {
    return this.reviewsService.findByUser(user.id, true);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Crea recensione',
    description: 'Crea una nuova recensione per un prodotto acquistato. Richiede acquisto verificato.'
  })
  async create(
    @CurrentUser() user: any,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, createReviewDto);
  }

  @Put('me/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Aggiorna mia recensione',
    description: 'Modifica una recensione esistente dell\'utente'
  })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateReviewDto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(id, user.id, updateReviewDto);
  }

  @Delete('me/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Elimina mia recensione',
    description: 'Rimuove definitivamente una recensione dell\'utente'
  })
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    await this.reviewsService.remove(id, user.id);
    return { 
      success: true,
      message: 'Recensione eliminata con successo' 
    };
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Vota utilità recensione',
    description: 'Vota se una recensione è stata utile o meno'
  })
  async voteHelpful(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() voteDto: ReviewVoteDto,
  ) {
    return this.reviewsService.voteHelpful(id, user.id, voteDto.isHelpful);
  }

  // ===========================
  // ADMIN ENDPOINTS
  // ===========================

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Tutte le recensioni (Admin)',
    description: 'Lista completa di tutte le recensioni incluse quelle non approvate'
  })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'isApproved', required: false, type: Boolean })
  @ApiQuery({ name: 'isFeatured', required: false, type: Boolean })
  @ApiQuery({ name: 'isVerifiedPurchase', required: false, type: Boolean })
  @ApiQuery({ name: 'hasImages', required: false, type: Boolean })
  @ApiQuery({ name: 'hasStoreResponse', required: false, type: Boolean })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Data inizio (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Data fine (YYYY-MM-DD)' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['newest', 'oldest', 'highest_rating', 'lowest_rating', 'most_helpful'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getAllReviewsAdmin(@Query() filterDto: ReviewFilterDto) {
    // Rimuovi il filtro default per approved per gli admin
    return this.reviewsService.findAll({
      ...filterDto,
      isApproved: filterDto.isApproved // Permetti di vedere anche quelle non approvate
    });
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Statistiche complete recensioni (Admin)',
    description: 'Dashboard completa con tutte le metriche delle recensioni'
  })
  async getReviewStats() {
    return this.reviewsService.getReviewStats();
  }

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Recensioni in attesa di approvazione (Admin)',
    description: 'Lista delle recensioni non ancora approvate che richiedono moderazione'
  })
  async getPendingReviews(@Query() filterDto: ReviewFilterDto) {
    return this.reviewsService.findAll({
      ...filterDto,
      isApproved: false,
      sortBy: 'newest'
    });
  }

  @Post('admin/:id/response')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Aggiungi risposta negozio (Admin)',
    description: 'Aggiungi una risposta ufficiale del negozio a una recensione'
  })
  async addStoreResponse(
    @Param('id') id: string,
    @Body() storeResponseDto: StoreResponseDto,
  ) {
    return this.reviewsService.addStoreResponse(id, storeResponseDto);
  }

  @Put('admin/:id/featured')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Toggle evidenzia recensione (Admin)',
    description: 'Attiva o disattiva l\'evidenziazione di una recensione'
  })
  async toggleFeatured(@Param('id') id: string) {
    return this.reviewsService.toggleFeatured(id);
  }

  @Put('admin/:id/approval')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Toggle approva recensione (Admin)',
    description: 'Approva o disapprova una recensione per la pubblicazione'
  })
  async toggleApproval(@Param('id') id: string) {
    return this.reviewsService.toggleApproval(id);
  }

  @Post('admin/bulk-action')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Azione bulk su recensioni (Admin)',
    description: 'Esegui azioni su multiple recensioni contemporaneamente'
  })
  async bulkAction(
    @CurrentUser() user: any,
    @Body() bulkActionDto: BulkReviewActionDto,
  ) {
    return this.reviewsService.bulkAction(bulkActionDto, user.id);
  }

  // ===========================
  // REPORTING & ANALYTICS
  // ===========================

  @Get('admin/reports/top-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Top prodotti per recensioni (Admin)',
    description: 'Prodotti con più recensioni e miglior rating'
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'minReviews', required: false, type: Number, example: 5, description: 'Minimo numero recensioni' })
  async getTopProductsReport(
    @Query('limit') limit: number = 20,
    @Query('minReviews') minReviews: number = 5,
  ) {
    // TODO: Implementare report prodotti top
    throw new BadRequestException('Report in sviluppo');
  }

  @Get('admin/reports/user-activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Attività utenti recensioni (Admin)',
    description: 'Utenti più attivi nelle recensioni e statistiche comportamentali'
  })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter', 'year'], example: 'month' })
  async getUserActivityReport(@Query('period') period: string = 'month') {
    // TODO: Implementare report attività utenti
    throw new BadRequestException('Report in sviluppo');
  }

  @Get('admin/export/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Esporta recensioni CSV (Admin)',
    description: 'Esporta le recensioni in formato CSV con filtri'
  })
  async exportReviews(@Query() filterDto: ReviewFilterDto) {
    // TODO: Implementare export CSV
    throw new BadRequestException('Export in sviluppo');
  }

  // ===========================
  // MODERATION TOOLS
  // ===========================

  @Get('admin/flagged')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Recensioni segnalate (Admin)',
    description: 'Recensioni che potrebbero richiedere moderazione (rating molto bassi, contenuto sospetto, etc.)'
  })
  async getFlaggedReviews() {
    // Recensioni con rating 1-2 stelle senza risposta del negozio
    return this.reviewsService.findAll({
      maxRating: 2,
      hasStoreResponse: false,
      isApproved: true,
      sortBy: 'newest',
      limit: 50
    });
  }

  @Get('admin/recent-activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Attività recente recensioni (Admin)',
    description: 'Ultime recensioni create, aggiornate e azioni di moderazione'
  })
  @ApiQuery({ name: 'hours', required: false, type: Number, example: 24, description: 'Ore di lookback' })
  async getRecentActivity(@Query('hours') hours: number = 24) {
    const dateFrom = new Date();
    dateFrom.setHours(dateFrom.getHours() - hours);

    return this.reviewsService.findAll({
      dateFrom: dateFrom.toISOString(),
      sortBy: 'newest',
      limit: 100,
      isApproved: undefined // Vedi tutte
    });
  }

  // ===========================
  // ANALYTICS ENDPOINTS
  // ===========================

  @Get('analytics/sentiment-trends')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Trend sentiment recensioni (Admin)',
    description: 'Analisi del sentiment delle recensioni nel tempo'
  })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter'], example: 'month' })
  @ApiQuery({ name: 'productId', required: false, description: 'Analisi per prodotto specifico' })
  async getSentimentTrends(
    @Query('period') period: string = 'month',
    @Query('productId') productId?: string,
  ) {
    // TODO: Implementare analisi sentiment
    throw new BadRequestException('Analisi sentiment in sviluppo');
  }

  @Get('analytics/response-effectiveness')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Efficacia risposte negozio (Admin)',
    description: 'Analisi dell\'impatto delle risposte del negozio sui rating successivi'
  })
  async getResponseEffectiveness() {
    // TODO: Implementare analisi efficacia risposte
    throw new BadRequestException('Analisi efficacia in sviluppo');
  }
}