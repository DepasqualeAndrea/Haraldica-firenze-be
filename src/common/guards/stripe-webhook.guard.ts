import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeService } from 'src/modules/public-api/payments/stripe.service';

@Injectable()
export class StripeWebhookGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req: any = context.switchToHttp().getRequest();
    const signature = req.headers['stripe-signature'];
    if (!signature) throw new BadRequestException('Signature mancante');
    const webhookSecret = this.config.get('stripe.webhookSecret');
    if (!webhookSecret) throw new BadRequestException('Webhook secret non configurato');

    const rawBody: Buffer | string =
      req.rawBody ??
      (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));

    try {
      const event = this.stripeService.constructEvent(rawBody, signature, webhookSecret);
      req.stripeEvent = event;
      return true;
    } catch (e: any) {
      throw new BadRequestException('Firma webhook invalida: ' + e.message);
    }
  }
}