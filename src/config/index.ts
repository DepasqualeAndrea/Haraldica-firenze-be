import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// Schema di validazione per le variabili ambiente
export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Database - supporta DATABASE_URL o credenziali separate (DB_HOST, DB_USERNAME, DB_PASSWORD)
  DATABASE_URL: Joi.string().optional(),
  DATABASE_SSL: Joi.boolean().default(false),

  // Credenziali separate per AWS Secrets Manager RDS
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.string().default('5432'),
  DB_NAME: Joi.string().default('postgres'),
  DB_USERNAME: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),

  // Auth rate limiting
  AUTH_RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  AUTH_RATE_LIMIT_MAX_REQUESTS: Joi.number().default(20),

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_PUBLISHABLE_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),

  // ============= EMAIL (AGGIORNATO) =============
  EMAIL_PROVIDER: Joi.string().valid('resend', 'ses', 'smtp').default('resend'),
  EMAIL_BRAND_NAME: Joi.string().default('Haraldica Firenze'),

  // Email addresses per type
  EMAIL_ORDERS: Joi.string().email().default('ordini@haraldicafirenze.com'),
  EMAIL_SUPPORT: Joi.string().email().default('supporto@haraldicafirenze.com'),
  EMAIL_INFO: Joi.string().email().default('info@haraldicafirenze.com'),
  EMAIL_ADMIN: Joi.string().email().default('amministrazione@haraldicafirenze.com'),
  
  // Resend (required if EMAIL_PROVIDER=resend)
  RESEND_API_KEY: Joi.string().when('EMAIL_PROVIDER', {
    is: 'resend',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  
  // AWS SES (required if EMAIL_PROVIDER=ses)
  AWS_SES_USE_IAM_ROLE: Joi.boolean().default(false),
  AWS_SES_ACCESS_KEY_ID: Joi.string().when('EMAIL_PROVIDER', {
    is: 'ses',
    then: Joi.when('AWS_SES_USE_IAM_ROLE', {
      is: true,
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.optional(),
  }),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().when('EMAIL_PROVIDER', {
    is: 'ses',
    then: Joi.when('AWS_SES_USE_IAM_ROLE', {
      is: true,
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.optional(),
  }),
  AWS_SES_REGION: Joi.string().default('eu-central-1'),
  
  // SMTP (optional - only if EMAIL_PROVIDER=smtp)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(), // ← Nota: SMTP_PASS, non SMTP_PASSWORD
  
  // Email Rate Limiting
  EMAIL_RATE_LIMIT_PER_SECOND: Joi.number().default(10),
  EMAIL_RETRY_ATTEMPTS: Joi.number().default(3),
  EMAIL_MAX_BATCH_SIZE: Joi.number().default(50),

  // Frontend
  FRONTEND_URL: Joi.string().required(),

  // Cookies
  COOKIE_DOMAIN: Joi.string().optional(),
  COOKIE_SECURE: Joi.boolean().default(false),
  COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

  // AWS S3 (opzionali - in ECS usa il ruolo IAM del task)
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_S3_BUCKET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export default registerAs('app', () => {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const environment = process.env.NODE_ENV || 'development';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
  const apiVersion = process.env.API_VERSION || 'v1';

  if (environment === 'production' && !process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL è richiesta in produzione');
  }

  return {
    port,
    environment,
    frontendUrl,
    backendUrl,
    apiVersion,
  };
});