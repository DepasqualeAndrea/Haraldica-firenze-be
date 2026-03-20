import {
  Controller,
  UseGuards,
  Post,
  Body,
  Get,
  Param,
  Put,
  Query,
  NotFoundException,
  Logger,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { FlexibleAuthGuard } from 'src/common/guards/flexible-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { OrdersService } from './orders.service';
import { CheckoutService } from './checkout.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutDto, OrderFilterDto } from './dto/order.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly checkoutService: CheckoutService,
    private readonly paymentsService: PaymentsService,
  ) { }

  @Post('checkout/elements/init')
  @UseGuards(FlexibleAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Inizializza Stripe Elements',
    description:
      'Valida carrello, crea ordine PENDING con stock reservation, restituisce PaymentIntent clientSecret',
  })
  async initElements(@CurrentUser() user: any, @Body() dto: CheckoutDto) {
    const actualUser = user?.user || user;
    return this.checkoutService.initElements(actualUser, dto);
  }

  @Post('elements/confirm/:paymentIntentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Conferma pagamento Stripe Elements',
    description: 'Verifica che il pagamento è stato completato',
  })
  @ApiParam({ name: 'paymentIntentId' })
  async confirmElementsPayment(@Param('paymentIntentId') paymentIntentId: string) {
    return this.checkoutService.confirmElementsPayment(paymentIntentId);
  }

  @Get('elements/status/:paymentIntentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'paymentIntentId' })
  async getElementsPaymentStatus(@Param('paymentIntentId') paymentIntentId: string) {
    const payment = await this.paymentsService.findByPaymentIntentId(paymentIntentId);

    if (!payment) {
      throw new NotFoundException('Payment Intent non trovato');
    }

    return {
      paymentIntentId: payment.stripePaymentIntentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      order: payment.order
        ? {
          id: payment.order.id,
          orderNumber: payment.order.orderNumber,
          status: payment.order.status,
        }
        : null,
    };
  }

  @Get('elements/config')
  @ApiOperation({
    summary: 'Configurazione per Stripe Elements (Public)',
    description: 'Restituisce la configurazione UI per Elements',
  })
  getElementsConfig() {
    return {
      supportedPaymentMethods: [
        {
          type: 'card',
          label: 'Carta di Credito/Debito',
          icon: 'credit-card',
          description: 'Visa, Mastercard, American Express',
          currencies: ['eur'],
          countries: ['IT', 'FR', 'DE', 'ES'],
        },
      ],
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0066cc',
          colorBackground: '#ffffff',
          colorText: '#30313d',
          colorDanger: '#dc2626',
          fontFamily: '"Inter", "Helvetica Neue", Helvetica, sans-serif',
          spacingUnit: '4px',
          borderRadius: '8px',
        },
      },
      locale: 'it',
    };
  }

  @Get('checkout/:orderId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stato checkout per ordine' })
  @ApiParam({ name: 'orderId' })
  async getCheckoutStatus(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.checkoutService.getCheckoutStatus(orderId);
  }

  @Post('checkout/:orderId/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Riprova pagamento per ordine esistente' })
  @ApiParam({ name: 'orderId' })
  async retryPayment(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.checkoutService.retryPayment(orderId);
  }

  @Get('checkout/addresses')
  @UseGuards(FlexibleAuthGuard)
  @ApiBearerAuth()
  async getCheckoutAddresses(@CurrentUser() user: any) {
    return this.checkoutService.getCheckoutAddresses(user);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async getMyOrders(@CurrentUser() user: any, @Query() filters: OrderFilterDto) {
    return this.ordersService.findUserOrders(user.id, filters);
  }

  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dettaglio mio ordine',
    description: "Dettagli completi di un ordine specifico dell'utente",
  })
  @ApiParam({ name: 'id' })
  async getMyOrder(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) orderId: string) {
    return this.ordersService.findOneDetailed(orderId, user.id);
  }

  @Put('my/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id' })
  async cancelMyOrder(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() body: { reason?: string },
  ) {
    return this.ordersService.cancelOrder(orderId, body.reason || 'Cancellato dall\'utente', user.id);
  }

  @Get('number/:orderNumber')
  @ApiParam({ name: 'orderNumber', example: 'MRV20251121001' })
  @ApiQuery({
    name: 'email',
    required: false,
    description: 'Customer email per validazione ordini guest',
  })
  async getOrderByNumber(
    @Param('orderNumber') orderNumber: string,
    @Query('email') email?: string,
  ) {
    const order = await this.ordersService.findByOrderNumber(orderNumber);

    if (!order) {
      throw new NotFoundException(`Ordine ${orderNumber} non trovato`);
    }
    if (order.orderType !== 'guest') {
      return order;
    }

    if (!email) {
      return order;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const orderEmail =
      order.lastCheckoutEmail?.trim().toLowerCase() ??
      order.customerEmail?.trim().toLowerCase() ??
      null;

    if (!orderEmail || orderEmail !== normalizedEmail) {
      throw new NotFoundException('Ordine non trovato con questa email');
    }

    return order;
  }

  @Post('track')
  async trackGuestOrder(
    @Body()
    body: {
      orderNumber?: string;
      trackingToken?: string;
      email: string;
    },
  ) {
    const { orderNumber, trackingToken, email } = body;

    if (!email || (!orderNumber && !trackingToken)) {
      throw new BadRequestException(
        'Email e (numero ordine o tracking token) sono obbligatori',
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    this.logger.log(
      `🔍 Track guest order: orderNumber=${orderNumber || 'none'}, ` +
      `trackingToken=${trackingToken || 'none'}, email=${normalizedEmail}`,
    );

    if (trackingToken) {
      const orderByToken = await this.ordersService.findByTrackingToken(
        trackingToken,
        normalizedEmail,
      );

      if (orderByToken) {
        return orderByToken;
      }
    }

    if (orderNumber) {
      const order = await this.ordersService.findByOrderNumber(orderNumber);

      if (!order) {
        throw new NotFoundException('Ordine non trovato');
      }

      if (order.orderType !== 'guest') {
        throw new NotFoundException('Ordine non trovato');
      }

      const orderEmail =
        order.lastCheckoutEmail?.trim().toLowerCase() ??
        order.customerEmail?.trim().toLowerCase() ??
        null;

      if (!orderEmail || orderEmail !== normalizedEmail) {
        throw new NotFoundException('Ordine non trovato con questi dati');
      }

      return order;
    }

    throw new NotFoundException('Ordine non trovato con questi dati');
  }

  @Get('check/:orderNumber')
  @ApiParam({ name: 'orderNumber' })
  async checkOrderExists(@Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.findByOrderNumber(orderNumber);
    return { exists: !!order, orderNumber };
  }

  @Get('success')
  @UseGuards(FlexibleAuthGuard)
  @ApiQuery({ name: 'payment_intent', required: false })
  @ApiQuery({ name: 'order_id', required: false })
  @ApiQuery({ name: 'order_number', required: false })
  @ApiQuery({ name: 'tracking_token', required: false })
  async handleSuccessPage(
    @CurrentUser() user: any,
    @Query('payment_intent') paymentIntentId?: string,
    @Query('order_id') orderId?: string,
    @Query('order_number') orderNumber?: string,
    @Query('tracking_token') trackingToken?: string,
  ) {

    if (orderId) {
      return this.ordersService.findOne(orderId);
    }

    if (orderNumber) {
      return this.ordersService.findByOrderNumber(orderNumber);
    }

    if (trackingToken && user?.email) {
      return this.ordersService.findByTrackingToken(trackingToken, user.email);
    }

    if (paymentIntentId) {
      const order = await this.ordersService.findByPaymentIntentId(paymentIntentId, user?.id);

      if (order) return order;

      throw new NotFoundException('Ordine non ancora disponibile, riprova tra qualche secondo');
    }

    throw new NotFoundException('Nessun ordine trovato per la pagina di successo');
  }

  @Get('by-payment-intent/:paymentIntentId')
  @UseGuards(FlexibleAuthGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'paymentIntentId', description: 'Stripe Payment Intent ID' })
  async getOrderByPaymentIntent(
    @Param('paymentIntentId') paymentIntentId: string,
    @CurrentUser() user: any,
  ): Promise<Order> {

    const order = await this.ordersService.findByPaymentIntentId(
      paymentIntentId,
      user?.id
    );

    if (!order) {
      throw new NotFoundException(
        'Ordine non trovato o ancora in elaborazione. Attendi qualche secondo.'
      );
    }

    return order;
  }

  @Get('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async handleOrderCancel(@CurrentUser() user: any) {
    const lastOrder = await this.ordersService.getLastPendingOrder(user.id);

    if (lastOrder) {
      return {
        message: 'Pagamento annullato',
        order: lastOrder,
        canRetry: true,
        orderId: lastOrder.id,
      };
    }

    return {
      message: 'Nessun ordine in sospeso trovato',
      canRetry: false,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dettaglio ordine',
    description: 'Recupera i dettagli di un ordine specifico',
  })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.ordersService.findOneDetailed(id, user.id);
  }

  @Put('my/:id/update')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Order ID' })
  async updateMyOrder(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() body: {
      shippingAddress?: {
        name: string;
        street: string;
        city: string;
        postalCode: string;
        province?: string;
        country: string;
        phone?: string;
      };
      billingAddress?: {
        name: string;
        street: string;
        city: string;
        postalCode: string;
        province?: string;
        country: string;
      };
      notes?: string;
    },
  ) {
    this.logger.log(`📝 User ${user.id} updating order ${orderId}`);

    // Validazione: almeno un campo da modificare
    if (!body.shippingAddress && !body.billingAddress && !body.notes) {
      throw new BadRequestException('Nessuna modifica specificata');
    }

    const updatedOrder = await this.ordersService.updateOrder(
      orderId,
      body,
      user.id,
    );

    return {
      success: true,
      message: 'Ordine modificato con successo',
      order: updatedOrder,
    };
  }
}