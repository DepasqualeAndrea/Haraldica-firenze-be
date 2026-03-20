import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import { ConfigValidator } from './utils/config-validator';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import { csrfMiddleware } from './common/middleware/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  process.on('unhandledRejection', (reason, p) => {
    console.error('UNHANDLED REJECTION at:', p, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
  });


  app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);

  const configService = app.get(ConfigService);
  const port = configService.get('app.port', 3000);
  const isProduction = configService.get('app.environment') === 'production';
  const localIps = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const getRequestIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  };
  const isLocalRequest = (req: Request): boolean => {
    if (isProduction) return false;
    return localIps.has(getRequestIp(req));
  };

  // ============= VALIDAZIONE CONFIGURAZIONI =============
  try {
    ConfigValidator.validateAll(configService);
    ConfigValidator.printConfigSummary(configService);
  } catch (error) {
    Logger.error('❌ Configurazione non valida:', error.message);
    process.exit(1);
  }

  // ============= SECURITY =============

  // ✅ CRITICAL FIX: Configure CSP and security headers
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny',
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  }));

  // CORS configuration
  const frontendUrl = configService.get('app.frontendUrl');

  // Parse origins - supporta sia singola stringa che lista separata da virgole
  let allowedOrigins: string | string[];
  if (typeof frontendUrl === 'string') {
    allowedOrigins = frontendUrl.includes(',')
      ? frontendUrl.split(',').map(url => url.trim()).filter(url => url.length > 0)
      : [frontendUrl.trim()];
  } else {
    allowedOrigins = frontendUrl;
  }

  Logger.log(`🌐 CORS enabled for origins: ${JSON.stringify(allowedOrigins)}`);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['stripe-signature', 'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Guest-Request',
      'X-CSRF-Token'],
  });

  app.use(cookieParser());
  app.use(csrfMiddleware);


  const getRequestPath = (req: Request): string => req.path || req.url || '';
  const pathStartsWith = (path: string, prefix: string): boolean =>
    path === prefix || path.startsWith(`${prefix}/`);

  const authRateLimitPaths = [
    '/api/v1/auth/csrf',
    '/api/v1/auth/session',
    '/api/v1/auth/refresh',
    '/api/v1/auth/guest-token',
    '/api/v1/auth/guest-token/validate',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/logout',
  ];

  const productRateLimitPrefixes = [
    '/api/v1/products',
  ];

  const cartGuestRateLimitPrefixes = [
    '/api/v1/cart/guest',
  ];

  const checkoutRateLimitPaths = [
    '/api/v1/orders/checkout/elements/init',
    '/api/v1/orders/elements/confirm',
  ];

  const shouldSkipGlobalRateLimit = (req: Request): boolean => {
    const path = getRequestPath(req);
    if (path.includes('/webhooks/stripe') || path.includes('/health')) return true;
    if (authRateLimitPaths.some((p) => pathStartsWith(path, p))) return true;
    if (productRateLimitPrefixes.some((p) => pathStartsWith(path, p))) return true;
    if (cartGuestRateLimitPrefixes.some((p) => pathStartsWith(path, p))) return true;
    if (checkoutRateLimitPaths.some((p) => pathStartsWith(path, p))) return true;
    return false;
  };

  // Rate limiting
  const rateLimitConfig = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 500 : 1000, // 500 req/15min prod (sufficiente per e-commerce medio)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // ✅ Escludi webhook e health check da rate limiting
      return shouldSkipGlobalRateLimit(req);
    },
  });

  app.use(rateLimitConfig);
  app.use(compression());

  // ============= BODY PARSING CONFIGURATION =============
  // 1) RAW PRIMA DI QUALSIASI ALTRO PARSER per la route Stripe
  app.use('/webhooks/stripe', bodyParser.raw({ type: '*/*' }));
  // In alternativa: bodyParser.raw({ type: 'application/json' })

  // 2) Parser generali per il resto dell’app
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // ✅ Parser JSON globale per tutto il resto
  app.use(json({
    limit: '10mb',
  }));

  app.use(urlencoded({
    extended: true,
    limit: '10mb'
  }));

  // ============= VALIDATION =============

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // ============= API DOCUMENTATION =============

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Haraldica Firenze API')
      .setDescription('API documentation for Haraldica Firenze e-commerce platform')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product catalog')
      .addTag('cart', 'Shopping cart')
      .addTag('orders', 'Order management')
      .addTag('payments', 'Payment processing')
      .addTag('webhooks', 'Webhook endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'Haraldica Firenze API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    });
  }

  // ============= GLOBAL PREFIX =============

  app.setGlobalPrefix('api/v1', {
    exclude: ['/webhooks/stripe', '/health'],
  });

  const authSafePaths = new Set([
    '/csrf',
    '/session',
    '/guest-token',
    '/guest-token/validate',
    '/refresh',
    '/login',
    '/register',
    '/logout',
  ]);

  // Auth endpoints rate limiting (higher bucket)
  const authSafeRateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 req/min
    message: 'Troppi tentativi, riprova più tardi.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isProduction || isLocalRequest(req),
  });
  app.use(
    authRateLimitPaths,
    authSafeRateLimitConfig,
  );

  // Products browsing rate limiting
  const productsRateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 req/min
    message: 'Troppi tentativi, riprova più tardi.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isProduction || isLocalRequest(req) || req.method !== 'GET',
  });
  app.use('/api/v1/products', productsRateLimitConfig);

  // Guest cart rate limiting
  const cartGuestRateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 req/min
    message: 'Troppi tentativi, riprova più tardi.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isProduction || isLocalRequest(req),
  });
  app.use('/api/v1/cart/guest', cartGuestRateLimitConfig);

  // Checkout rate limiting
  const checkoutRateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 req/min
    message: 'Troppi tentativi, riprova più tardi.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isProduction || isLocalRequest(req),
  });
  app.use(checkoutRateLimitPaths, checkoutRateLimitConfig);

  // Auth rate limiting (anti brute-force)
  const authRateLimitConfig = rateLimit({
    windowMs: parseInt(configService.get('AUTH_RATE_LIMIT_WINDOW_MS', '900000')),
    max: parseInt(configService.get('AUTH_RATE_LIMIT_MAX_REQUESTS', '20')),
    message: 'Troppi tentativi di autenticazione, riprova più tardi.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isLocalRequest(req) || authSafePaths.has(req.path),
  });
  app.use('/api/v1/auth', authRateLimitConfig);

  // ============= HEALTH CHECK =============

  app.use('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: configService.get('app.environment'),
      version: configService.get('app.apiVersion'),
      uptime: process.uptime(),
    });
  });

  // ============= GRACEFUL SHUTDOWN =============

  const shutdown = async (signal: string) => {
    Logger.log(`${signal} received, shutting down gracefully`);
    try {
      await app.close();
      Logger.log('✅ Application closed successfully');
      process.exit(0);
    } catch (error) {
      Logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ============= START SERVER =============

  await app.listen(port, '0.0.0.0');

  Logger.log(`🚀 Application is running on: http://localhost:${port}`);
  Logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  Logger.log(`💓 Health Check: http://localhost:${port}/health`);
  Logger.log(`🔧 Environment: ${configService.get('app.environment')}`);
  Logger.log(`🎯 Stripe Mode: ${configService.get('stripe.secretKey').startsWith('sk_test') ? 'TEST' : 'LIVE'}`);

  if (!isProduction) {
    Logger.log(`🧪 Webhook Test: http://localhost:${port}/webhooks/stripe/test`);
    Logger.log(`💊 Webhook Health: http://localhost:${port}/webhooks/stripe/health`);
  }
}

bootstrap().catch((error) => {
  Logger.error('❌ Error starting application:', error);
  process.exit(1);
});


