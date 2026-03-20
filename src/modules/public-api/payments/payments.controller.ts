import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Delete,
  Logger,
  ParseUUIDPipe,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Put,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/entities/user.entity';
import { plainToClass } from 'class-transformer';

// Services
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

// DTOs
import {
  SavePaymentMethodDto,
  PaymentMethodResponseDto,
  SetupIntentResponseDto,
  CreateSetupIntentDto,
  CreateAdvancedRefundDto,
  RefundResponseDto,
  PaymentInsightsFilterDto,
  PaymentInsightsResponseDto,
  DisputeResponseDto,
  UpdateDisputeDto,
  StripeCouponResponseDto,
  StripeCreateCouponDto,
  CreatePromotionCodeDto,
  BalanceTransactionFilterDto,
  PayoutFilterDto,
  StripeHealthCheckResponseDto,
  WebhookTestResponseDto,
} from './dto/stripe-webhook.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    private stripeService: StripeService,
  ) { }

  // ===========================
  // 💳 PAYMENT METHODS
  // ===========================

  @Post('payment-methods')
  @ApiOperation({ summary: 'Salva metodo di pagamento' })
  @ApiResponse({ type: PaymentMethodResponseDto })
  async savePaymentMethod(
    @Body() savePaymentMethodDto: SavePaymentMethodDto,
    @GetUser() user: any,
  ): Promise<PaymentMethodResponseDto> {
    const result = await this.paymentsService.savePaymentMethod(
      user.id,
      savePaymentMethodDto.paymentMethodId,
      savePaymentMethodDto.setAsDefault,
    );

    return plainToClass(
      PaymentMethodResponseDto,
      {
        ...result.paymentMethod,
        isDefault: result.isDefault,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get('payment-methods')
  @ApiOperation({ summary: 'Lista metodi di pagamento' })
  @ApiResponse({ type: [PaymentMethodResponseDto] })
  async getUserPaymentMethods(
    @GetUser() user: any,
  ): Promise<PaymentMethodResponseDto[]> {
    const paymentMethods = await this.paymentsService.getUserPaymentMethods(
      user.id,
    );

    return paymentMethods.map((pm) =>
      plainToClass(PaymentMethodResponseDto, pm, {
        excludeExtraneousValues: true,
      }),
    );
  }

  @Delete('payment-methods/:paymentMethodId')
  @ApiOperation({ summary: 'Rimuovi metodo di pagamento' })
  @ApiParam({ name: 'paymentMethodId' })
  async removePaymentMethod(
    @Param('paymentMethodId') paymentMethodId: string,
    @GetUser() user: any,
  ): Promise<{ success: boolean; message: string }> {
    const success = await this.paymentsService.removePaymentMethod(
      user.id,
      paymentMethodId,
    );

    return {
      success,
      message: success
        ? 'Metodo di pagamento rimosso con successo'
        : 'Errore rimozione metodo di pagamento',
    };
  }

  // ===========================
  // 🔧 SETUP INTENTS
  // ===========================

  @Post('setup-intent')
  @ApiOperation({ summary: 'Crea Setup Intent' })
  @ApiResponse({ type: SetupIntentResponseDto })
  async createSetupIntent(
    @Body() createSetupIntentDto: CreateSetupIntentDto,
    @GetUser() user: any,
  ): Promise<SetupIntentResponseDto> {
    const result = await this.paymentsService.createSetupIntent(user.id, {
      paymentMethodTypes: createSetupIntentDto.paymentMethodTypes,
      usage: createSetupIntentDto.usage,
      metadata: {
        ...createSetupIntentDto.metadata,
        userId: user.id,
        createdAt: new Date().toISOString(),
      },
    });

    return plainToClass(SetupIntentResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  // ===========================
  // 💰 REFUNDS
  // ===========================

  @Post('refunds')
  @ApiOperation({ summary: 'Crea rimborso avanzato (Admin)' })
  @ApiResponse({ type: RefundResponseDto })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createAdvancedRefund(
    @Body() createRefundDto: CreateAdvancedRefundDto,
  ): Promise<RefundResponseDto> {
    this.logger.log(
      `🔄 Creazione rimborso: ${JSON.stringify(createRefundDto)}`,
    );

    const result = await this.paymentsService.createAdvancedRefund(
      createRefundDto,
    );

    this.logger.log(
      `✅ Rimborso creato: ${result.refund.id} - €${result.refundAmount}`,
    );

    return plainToClass(
      RefundResponseDto,
      {
        refundId: result.refund.id,
        refundAmount: result.refundAmount,
        stockRestored: result.stockRestored,
        notificationSent: result.notificationSent,
        orderStatus: result.orderStatus,
        estimatedArrival: this.calculateRefundArrival(),
        isFullRefund:
          result.refundAmount >= (result.refund.charge?.amount / 100 || 0),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get('refunds')
  @ApiOperation({ summary: 'Lista rimborsi (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async listRefunds(
    @Query('charge') charge?: string,
    @Query('payment_intent') paymentIntent?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
    @Query('created_gte') createdGte?: string,
    @Query('created_lte') createdLte?: string,
  ): Promise<any[]> {
    const filters: any = {};
    if (charge) filters.charge = charge;
    if (paymentIntent) filters.payment_intent = paymentIntent;
    if (limit) filters.limit = Math.min(limit, 100);
    if (createdGte || createdLte) {
      filters.created = {};
      if (createdGte)
        filters.created.gte = Math.floor(new Date(createdGte).getTime() / 1000);
      if (createdLte)
        filters.created.lte = Math.floor(new Date(createdLte).getTime() / 1000);
    }

    const refunds = await this.stripeService.listRefunds(filters);

    return refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      created: new Date(refund.created * 1000),
      charge: refund.charge,
      paymentIntent: refund.payment_intent,
    }));
  }

  // ===========================
  // 📊 ANALYTICS & INSIGHTS
  // ===========================

  @Get('insights')
  @ApiOperation({ summary: 'Insights pagamenti (Admin)' })
  @ApiResponse({ type: PaymentInsightsResponseDto })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPaymentInsights(
    @Query() filterDto: PaymentInsightsFilterDto,
  ): Promise<PaymentInsightsResponseDto> {
    const insights = await this.paymentsService.getPaymentInsights({
      startDate: filterDto.startDate,
      endDate: filterDto.endDate,
      userId: filterDto.userId,
      status: filterDto.status,
    });

    return plainToClass(
      PaymentInsightsResponseDto,
      {
        ...insights,
        revenueByPeriod: insights.revenueByDay.map((item) => ({
          ...item,
          averageValue:
            item.transactions > 0 ? item.revenue / item.transactions : 0,
        })),
        refundStats: {
          totalRefunded: insights.totalRevenue * (insights.refundRate / 100),
          refundCount: Math.floor(
            insights.totalTransactions * (insights.refundRate / 100),
          ),
          averageRefundAmount:
            (insights.totalRevenue * (insights.refundRate / 100)) /
            Math.max(
              1,
              Math.floor(
                insights.totalTransactions * (insights.refundRate / 100),
              ),
            ),
          topRefundReasons: insights.failureReasons
            .slice(0, 5)
            .map((reason) => ({
              reason: reason.reason,
              count: reason.count,
              amount: reason.count * 50,
            })),
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get('insights/user/:userId')
  @ApiOperation({ summary: 'Insights utente (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getUserPaymentInsights(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() filterDto: PaymentInsightsFilterDto,
  ): Promise<PaymentInsightsResponseDto> {
    const insights = await this.paymentsService.getPaymentInsights({
      ...filterDto,
      userId,
    });

    return plainToClass(PaymentInsightsResponseDto, insights, {
      excludeExtraneousValues: true,
    });
  }

  // ===========================
  // ⚠️ DISPUTES
  // ===========================

  @Get('disputes')
  @ApiOperation({ summary: 'Lista contestazioni (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async listDisputes(
    @Query('charge') charge?: string,
    @Query('payment_intent') paymentIntent?: string,
    @Query('status') status?: string,
    @Query('created_gte') createdGte?: string,
    @Query('created_lte') createdLte?: string,
  ): Promise<DisputeResponseDto[]> {
    const filters: any = {};
    if (charge) filters.charge = charge;
    if (paymentIntent) filters.payment_intent = paymentIntent;
    if (status) filters.status = status;
    if (createdGte || createdLte) {
      filters.created = {};
      if (createdGte)
        filters.created.gte = Math.floor(new Date(createdGte).getTime() / 1000);
      if (createdLte)
        filters.created.lte = Math.floor(new Date(createdLte).getTime() / 1000);
    }

    const disputes = await this.stripeService.listDisputes(filters);

    return disputes.map((dispute) =>
      plainToClass(
        DisputeResponseDto,
        {
          id: dispute.id,
          amount: dispute.amount / 100,
          currency: dispute.currency,
          reason: dispute.reason,
          status: dispute.status,
          created: new Date(dispute.created * 1000),
          evidenceDueBy: dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000)
            : null,
          isChargeRefundable: dispute.is_charge_refundable,
          chargeId: dispute.charge,
          paymentIntentId: dispute.payment_intent,
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  @Put('disputes/:disputeId')
  @ApiOperation({ summary: 'Aggiorna contestazione (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateDispute(
    @Param('disputeId') disputeId: string,
    @Body() updateDisputeDto: UpdateDisputeDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.stripeService.updateDispute(disputeId, {
      evidence: updateDisputeDto.evidence,
      metadata: updateDisputeDto.metadata,
      submit: updateDisputeDto.submit,
    });

    return {
      success: true,
      message: updateDisputeDto.submit
        ? 'Prove inviate con successo'
        : 'Prove salvate, ricorda di inviarle prima della scadenza',
    };
  }

  // ===========================
  // 🎁 COUPONS & PROMOTIONS
  // ===========================

  @Post('coupons')
  @ApiOperation({ summary: 'Crea coupon (Admin)' })
  @ApiResponse({ type: StripeCouponResponseDto })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createCoupon(
    @Body() createCouponDto: StripeCreateCouponDto,
  ): Promise<StripeCouponResponseDto> {
    const coupon = await this.stripeService.createCoupon({
      id: createCouponDto.id,
      duration: createCouponDto.duration,
      amount_off: createCouponDto.amountOff,
      percent_off: createCouponDto.percentOff,
      currency: createCouponDto.currency,
      duration_in_months: createCouponDto.durationInMonths,
      max_redemptions: createCouponDto.maxRedemptions,
      name: createCouponDto.name,
      redeem_by: createCouponDto.redeemBy
        ? Math.floor(createCouponDto.redeemBy.getTime() / 1000)
        : undefined,
      applies_to: createCouponDto.applicableProducts
        ? { products: createCouponDto.applicableProducts }
        : undefined,
      metadata: createCouponDto.metadata,
    });

    return plainToClass(
      StripeCouponResponseDto,
      {
        id: coupon.id,
        duration: coupon.duration,
        amountOff: coupon.amount_off ? coupon.amount_off / 100 : undefined,
        percentOff: coupon.percent_off,
        currency: coupon.currency,
        name: coupon.name,
        valid: coupon.valid,
        timesRedeemed: coupon.times_redeemed,
        maxRedemptions: coupon.max_redemptions,
        redeemBy: coupon.redeem_by
          ? new Date(coupon.redeem_by * 1000)
          : undefined,
        created: new Date(coupon.created * 1000),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('promotion-codes')
  @ApiOperation({ summary: 'Crea codice promozionale (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createPromotionCode(
    @Body() createPromotionDto: CreatePromotionCodeDto,
  ): Promise<{ id: string; code: string; coupon: string; active: boolean }> {
    const promotionCode = await this.stripeService.createPromotionCode({
      coupon: createPromotionDto.couponId,
      code: createPromotionDto.code,
      customer: createPromotionDto.customerId,
      expires_at: createPromotionDto.expiresAt
        ? Math.floor(createPromotionDto.expiresAt.getTime() / 1000)
        : undefined,
      max_redemptions: createPromotionDto.maxRedemptions,
      restrictions: createPromotionDto.restrictions
        ? {
          first_time_transaction:
            createPromotionDto.restrictions.firstTimeTransaction,
          minimum_amount: createPromotionDto.restrictions.minimumAmount
            ? Math.round(createPromotionDto.restrictions.minimumAmount * 100)
            : undefined,
          minimum_amount_currency:
            createPromotionDto.restrictions.minimumAmountCurrency,
        }
        : undefined,
      metadata: createPromotionDto.metadata,
    });

    return {
      id: promotionCode.id,
      code: promotionCode.code,
      coupon: promotionCode.coupon as unknown as string,
      active: promotionCode.active,
    };
  }

  // ===========================
  // 💰 BALANCE & PAYOUTS
  // ===========================

  @Get('balance')
  @ApiOperation({ summary: 'Saldo Stripe (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getBalance(): Promise<any> {
    const stripe = this.stripeService.getStripeInstance();
    const balance = await stripe.balance.retrieve();

    return {
      available: balance.available.map((bal) => ({
        amount: bal.amount / 100,
        currency: bal.currency,
        sourceTypes: bal.source_types,
      })),
      pending: balance.pending.map((bal) => ({
        amount: bal.amount / 100,
        currency: bal.currency,
        sourceTypes: bal.source_types,
      })),
      livemode: balance.livemode,
    };
  }

  @Get('balance/transactions')
  @ApiOperation({ summary: 'Transazioni balance (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getBalanceTransactions(
    @Query() filterDto: BalanceTransactionFilterDto,
  ): Promise<any[]> {
    const filters: any = {};
    if (filterDto.availableOnGte || filterDto.availableOnLte) {
      filters.available_on = {};
      if (filterDto.availableOnGte)
        filters.available_on.gte = Math.floor(
          filterDto.availableOnGte.getTime() / 1000,
        );
      if (filterDto.availableOnLte)
        filters.available_on.lte = Math.floor(
          filterDto.availableOnLte.getTime() / 1000,
        );
    }
    if (filterDto.createdGte || filterDto.createdLte) {
      filters.created = {};
      if (filterDto.createdGte)
        filters.created.gte = Math.floor(filterDto.createdGte.getTime() / 1000);
      if (filterDto.createdLte)
        filters.created.lte = Math.floor(filterDto.createdLte.getTime() / 1000);
    }
    if (filterDto.currency) filters.currency = filterDto.currency;
    if (filterDto.type) filters.type = filterDto.type;
    if (filterDto.limit) filters.limit = filterDto.limit;

    const transactions = await this.stripeService.getBalanceTransactions(
      filters,
    );

    return transactions.map((txn) => ({
      id: txn.id,
      amount: txn.amount / 100,
      currency: txn.currency,
      description: txn.description,
      fee: txn.fee / 100,
      feeDetails: txn.fee_details.map((fee) => ({
        amount: fee.amount / 100,
        currency: fee.currency,
        description: fee.description,
        type: fee.type,
      })),
      net: txn.net / 100,
      status: txn.status,
      type: txn.type,
      availableOn: new Date(txn.available_on * 1000),
      created: new Date(txn.created * 1000),
    }));
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Lista payouts (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getPayouts(@Query() filterDto: PayoutFilterDto): Promise<any[]> {
    const filters: any = {};
    if (filterDto.arrivalDateGte || filterDto.arrivalDateLte) {
      filters.arrival_date = {};
      if (filterDto.arrivalDateGte)
        filters.arrival_date.gte = Math.floor(
          filterDto.arrivalDateGte.getTime() / 1000,
        );
      if (filterDto.arrivalDateLte)
        filters.arrival_date.lte = Math.floor(
          filterDto.arrivalDateLte.getTime() / 1000,
        );
    }
    if (filterDto.createdGte || filterDto.createdLte) {
      filters.created = {};
      if (filterDto.createdGte)
        filters.created.gte = Math.floor(filterDto.createdGte.getTime() / 1000);
      if (filterDto.createdLte)
        filters.created.lte = Math.floor(filterDto.createdLte.getTime() / 1000);
    }
    if (filterDto.destination) filters.destination = filterDto.destination;
    if (filterDto.status) filters.status = filterDto.status;
    if (filterDto.limit) filters.limit = filterDto.limit;

    const payouts = await this.stripeService.getPayouts(filters);

    return payouts.map((payout) => ({
      id: payout.id,
      amount: payout.amount / 100,
      currency: payout.currency,
      description: payout.description,
      destination: payout.destination,
      method: payout.method,
      status: payout.status,
      type: payout.type,
      arrivalDate: new Date(payout.arrival_date * 1000),
      created: new Date(payout.created * 1000),
    }));
  }

  // ===========================
  // 🏥 HEALTH & DIAGNOSTICS
  // ===========================

  @Get('health')
  @ApiOperation({ summary: 'Health check Stripe' })
  @ApiResponse({ type: StripeHealthCheckResponseDto })
  async getStripeHealth(): Promise<StripeHealthCheckResponseDto> {
    try {
      const health = await this.stripeService.healthCheck();
      const cacheStats = this.stripeService.getCacheStats();

      return plainToClass(
        StripeHealthCheckResponseDto,
        {
          ...health,
          cacheStats,
        },
        { excludeExtraneousValues: true },
      );
    } catch (error) {
      this.logger.error('❌ Errore health check:', error);
      return plainToClass(
        StripeHealthCheckResponseDto,
        {
          status: 'unhealthy',
          apiVersion: 'unknown',
          testMode: false,
          balanceAvailable: false,
          webhooksConfigured: false,
          lastCheck: new Date().toISOString(),
        },
        { excludeExtraneousValues: true },
      );
    }
  }

  @Post('test/webhooks')
  @ApiOperation({ summary: 'Test webhook endpoint (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async testWebhookEndpoint(
    @Body('endpointUrl') endpointUrl: string,
    @Body('events') events?: string[],
  ): Promise<WebhookTestResponseDto> {
    const result = await this.stripeService.testWebhookEndpoint(
      endpointUrl,
      events || ['payment_intent.succeeded', 'checkout.session.completed'],
    );

    return plainToClass(
      WebhookTestResponseDto,
      {
        ...result,
        endpointUrl,
        timestamp: new Date().toISOString(),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Delete('cache')
  @ApiOperation({ summary: 'Pulisci cache Stripe (Admin)' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async clearStripeCache(): Promise<{ success: boolean; message: string }> {
    this.stripeService.clearCache();

    return {
      success: true,
      message: 'Cache Stripe pulita con successo',
    };
  }

  // ===========================
  // 🛠️ HELPER METHODS
  // ===========================

  private calculateRefundArrival(): Date {
    const now = new Date();
    return new Date(now.setDate(now.getDate() + 7));
  }
}
