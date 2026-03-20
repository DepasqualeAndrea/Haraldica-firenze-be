import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from 'express';

@Catch()
export class StripeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StripeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let stripeError: any = null;

    // Handle Stripe errors
    if (exception && typeof exception === 'object' && 'type' in exception) {
      const error = exception as any;
      
      if (error.type?.startsWith('StripeError') || error.type?.includes('stripe')) {
        stripeError = {
          type: error.type,
          code: error.code,
          message: error.message,
          param: error.param,
          decline_code: error.decline_code,
        };

        // Map Stripe errors to HTTP statuses
        switch (error.type) {
          case 'StripeCardError':
            status = HttpStatus.PAYMENT_REQUIRED;
            message = 'Card was declined';
            break;
          case 'StripeRateLimitError':
            status = HttpStatus.TOO_MANY_REQUESTS;
            message = 'Too many requests to Stripe API';
            break;
          case 'StripeInvalidRequestError':
            status = HttpStatus.BAD_REQUEST;
            message = 'Invalid request to Stripe';
            break;
          case 'StripeAPIError':
            status = HttpStatus.BAD_GATEWAY;
            message = 'Stripe API error';
            break;
          case 'StripeConnectionError':
            status = HttpStatus.SERVICE_UNAVAILABLE;
            message = 'Network communication with Stripe failed';
            break;
          case 'StripeAuthenticationError':
            status = HttpStatus.UNAUTHORIZED;
            message = 'Authentication with Stripe API failed';
            break;
          default:
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            message = error.message || 'Stripe error occurred';
        }
      }
    }

    // Handle other NestJS exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      ...(stripeError && { stripe: stripeError }),
    };

    this.logger.error(`Payment Error: ${request.method} ${request.url}`, {
      ...errorResponse,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: (request as any).user?.id,
    });

    (response as any).status(status).json(errorResponse);
  }
}