// src/modules/orders/order-tracking.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsEmail, IsUUID } from 'class-validator';
import { OrdersService } from './orders.service';
import { OrderStatus } from 'src/database/entities/order.entity';

class TrackOrderDto {
  @IsUUID()
  trackingToken: string;

  @IsEmail()
  email: string;
}

class TrackOrderByTokenDto {
  @IsEmail()
  email: string;
}

@ApiTags('tracking')
@Controller('tracking')
export class OrderTrackingController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Track order by token and email' })
  @ApiResponse({ status: 200, description: 'Order tracking information' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async trackOrder(@Body() trackingData: TrackOrderDto) {
    const order = await this.ordersService.findByTrackingToken(
      trackingData.trackingToken,
      trackingData.email,
    );

    if (!order) {
      throw new NotFoundException('Ordine non trovato con i dati forniti');
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      trackingNumber: order.trackingNumber,
      estimatedDelivery: order.estimatedDelivery,
      shippingAddress: {
        city: order.shippingAddress.city,
        postalCode: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
      },
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.unitPrice,
      })),
      total: order.total,
      createdAt: order.createdAt,
      timeline: this.buildOrderTimeline(order),
    };
  }

  @Get(':token')
  @ApiOperation({ summary: 'Get order tracking page data' })
  async getTrackingPageData(@Param('token') token: string) {
    const orderExists = await this.ordersService.checkTrackingTokenExists(token);

    if (!orderExists) {
      throw new NotFoundException('Codice tracking non valido');
    }

    return {
      trackingToken: token,
      message: "Inserisci la tua email per visualizzare lo stato dell'ordine",
    };
  }

  @Post(':token/track')
  @ApiOperation({ summary: 'Track order by token (with email verification)' })
  async trackOrderByToken(@Param('token') token: string, @Body() data: TrackOrderByTokenDto) {
    return this.trackOrder({
      trackingToken: token,
      email: data.email,
    });
  }

  private buildOrderTimeline(order: any) {
    const timeline = [
      {
        status: 'PENDING',
        label: 'Ordine ricevuto',
        date: order.createdAt,
        completed: true,
        description: 'Il tuo ordine è stato ricevuto e sarà processato a breve',
      },
    ];

    if (order.status !== OrderStatus.PENDING) {
      timeline.push({
        status: 'CONFIRMED',
        label: 'Ordine confermato',
        date: order.updatedAt,
        completed: [
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ].includes(order.status),
        description: 'Pagamento confermato, stiamo preparando il tuo ordine',
      });
    }

    if (
      [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status)
    ) {
      timeline.push({
        status: 'PROCESSING',
        label: 'In preparazione',
        date: order.updatedAt,
        completed: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(
          order.status,
        ),
        description: 'Il tuo ordine è in preparazione nel nostro magazzino',
      });
    }

    if ([OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status)) {
      timeline.push({
        status: 'SHIPPED',
        label: 'Spedito',
        date: order.updatedAt,
        completed: [OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status),
        description: order.trackingNumber
          ? `Spedito con tracking: ${order.trackingNumber}`
          : 'Il tuo ordine è stato spedito',
      });
    }

    if (order.status === OrderStatus.DELIVERED) {
      timeline.push({
        status: 'DELIVERED',
        label: 'Consegnato',
        date: order.updatedAt,
        completed: true,
        description: 'Il tuo ordine è stato consegnato con successo',
      });
    }

    return timeline;
  }
}