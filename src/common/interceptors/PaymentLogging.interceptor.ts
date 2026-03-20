import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Observable, tap, catchError } from "rxjs";

@Injectable()
export class PaymentLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PaymentLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'] || '';
    const ip = request.ip;
    const userId = request.user?.id;

    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.log(`${method} ${url} - ${duration}ms - User: ${userId} - IP: ${ip}`);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(`${method} ${url} - ${duration}ms - Error: ${error.message} - User: ${userId} - IP: ${ip}`);
        throw error;
      }),
    );
  }
}