import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Utility per validare tutte le configurazioni all'avvio
 */
export class ConfigValidator {
  private static readonly logger = new Logger(ConfigValidator.name);

  static validateAll(configService: ConfigService): void {
    this.logger.log('🔍 Validazione configurazioni in corso...');

    const validations = [
      () => this.validateApp(configService),
      () => this.validateDatabase(configService),
      () => this.validateJWT(configService),
      () => this.validateStripe(configService),
      () => this.validateEmail(configService),
      () => this.validateSupabase(configService),
    ];

    const errors: string[] = [];

    validations.forEach((validation, index) => {
      try {
        validation();
      } catch (error) {
        errors.push(`Validazione ${index + 1}: ${error.message}`);
      }
    });

    if (errors.length > 0) {
      this.logger.error('❌ Errori di configurazione trovati:');
      errors.forEach(error => this.logger.error(`  - ${error}`));
      throw new Error(`Configurazione non valida: ${errors.length} errori trovati`);
    }

    this.logger.log('✅ Tutte le configurazioni sono valide');
  }

  private static validateApp(configService: ConfigService): void {
    const app = configService.get('app');
    if (!app) throw new Error('Configurazione app mancante');

    // Validazione Porta
    if (app.port < 1 || app.port > 65535) {
      throw new Error('PORT deve essere tra 1 e 65535');
    }

    // Validazione Ambiente e Frontend URL
    if (app.environment === 'production' && !app.frontendUrl) {
      throw new Error('FRONTEND_URL richiesta in produzione');
    }

    // ✅ VALIDAZIONE RIGOROSA URI MULTIPLI (Enterprise Security)
    if (app.frontendUrl) {
      // 1. Se è un asterisco (solo per test estremi), lo permettiamo o lo blocchiamo?
      // Se vuoi sicurezza massima, rimuovi questa riga dell'asterisco.
      if (app.frontendUrl === '*') {
        this.logger.warn('⚠️ ATTENZIONE: FRONTEND_URL è impostato su "*" (Wildcard). Non sicuro per produzione.');
      } else {
        // 2. Split per virgola
        const urls = app.frontendUrl.split(',');

        urls.forEach((url) => {
          const cleanUrl = url.trim();
          try {
            // 3. Usa il costruttore URL nativo per validare rigorosamente
            const parsedUrl = new URL(cleanUrl);

            // 4. Controllo protocollo (deve essere http o https)
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
              throw new Error(`Protocollo non valido in: ${cleanUrl}. Usa http:// o https://`);
            }
          } catch (e) {
            if (e.message.includes('Protocollo non valido')) throw e;
            throw new Error(`FRONTEND_URL contiene un URI non valido: "${cleanUrl}"`);
          }
        });
      }
    }
  }

  private static validateDatabase(configService: ConfigService): void {
    const db = configService.get('database');
    if (!db) throw new Error('Configurazione database mancante');

    // Supporta DATABASE_URL oppure credenziali separate (DB_HOST, DB_USERNAME, DB_PASSWORD)
    const hasDbUrl = !!process.env.DATABASE_URL;
    const hasDbCredentials =
      !!process.env.DB_HOST &&
      !!process.env.DB_USERNAME &&
      !!process.env.DB_PASSWORD;

    if (!hasDbUrl && !hasDbCredentials) {
      throw new Error(
        'DATABASE_URL oppure DB_HOST + DB_USERNAME + DB_PASSWORD richieste'
      );
    }
  }

  private static validateJWT(configService: ConfigService): void {
    const jwt = configService.get('jwt');
    if (!jwt) throw new Error('Configurazione JWT mancante');

    if (jwt.secret.length < 32) {
      throw new Error('JWT_SECRET troppo corto (min 32 caratteri)');
    }
  }

  private static validateStripe(configService: ConfigService): void {
    const stripe = configService.get('stripe');
    if (!stripe) throw new Error('Configurazione Stripe mancante');

    const isTest = stripe.secretKey.startsWith('sk_test_');
    const isProduction = configService.get('app.environment') === 'production';

    if (isProduction && isTest) {
      throw new Error('Stripe TEST keys in produzione non sono consentite');
    }

    if (!isProduction && !isTest) {
      this.logger.warn('⚠️ ATTENZIONE: Usando chiavi Stripe LIVE in development!');
    }
  }

  private static validateEmail(configService: ConfigService): void {
    const email = configService.get('email');
    if (!email) throw new Error('Configurazione email mancante');

    // ✅ FIX: Valida EMAIL_ORDERS invece di EMAIL_FROM
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Valida che almeno un indirizzo email sia configurato
    // email.config.ts restituisce { addresses: { orders, support, ... } }
    const emailObj = email.addresses ?? email;
    const emailAddresses = [
      emailObj.orders,
      emailObj.support,
      emailObj.info,
      emailObj.admin,
    ].filter(Boolean);

    if (emailAddresses.length === 0) {
      throw new Error('Almeno un indirizzo email deve essere configurato');
    }

    // Valida formato email
    emailAddresses.forEach(emailAddr => {
      if (!emailRegex.test(emailAddr)) {
        throw new Error(`Formato email non valido: ${emailAddr}`);
      }
    });

    // Valida provider
    const validProviders = ['resend', 'ses', 'smtp'];
    if (!validProviders.includes(email.provider)) {
      throw new Error(`EMAIL_PROVIDER non valido: ${email.provider}. Usa: ${validProviders.join(', ')}`);
    }

    // Valida configurazione provider-specific
    if (email.provider === 'resend' && !email.resend?.apiKey) {
      throw new Error('RESEND_API_KEY richiesta quando EMAIL_PROVIDER=resend');
    }

    if (email.provider === 'ses') {
      if (!email.ses?.accessKeyId || !email.ses?.secretAccessKey) {
        throw new Error('AWS SES credentials richieste quando EMAIL_PROVIDER=ses');
      }
    }

    if (email.provider === 'smtp') {
      if (!email.smtp?.host || !email.smtp?.auth?.user || !email.smtp?.auth?.pass) {
        throw new Error('SMTP configuration completa richiesta quando EMAIL_PROVIDER=smtp');
      }
    }
  }

  private static validateSupabase(configService: ConfigService): void {
    const isProduction = configService.get('app.environment') === 'production';
    if (!isProduction) return;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL richiesta in produzione');
    }
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_KEY richiesta in produzione');
    }
    if (!supabaseJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET richiesta in produzione');
    }
  }

  /**
   * Stampa un riassunto delle configurazioni (senza dati sensibili)
   */
  static printConfigSummary(configService: ConfigService): void {
    const app = configService.get('app');
    const stripe = configService.get('stripe');
    const db = configService.get('database');
    const email = configService.get('email');

    this.logger.log('📋 Riassunto configurazioni:');
    this.logger.log(`  Environment: ${app.environment}`);
    this.logger.log(`  Port: ${app.port}`);
    this.logger.log(`  Frontend URL: ${app.frontendUrl}`);
    this.logger.log(`  Stripe Mode: ${stripe.secretKey.startsWith('sk_test') ? 'TEST' : 'LIVE'}`);
    this.logger.log(`  Database: ${db.type}`);
    this.logger.log(`  SSL Database: ${!!db.ssl}`);

    // ✅ FIX: email.config.ts restituisce { addresses: { orders, ... } }
    const emailAddr = email.addresses ?? email;
    this.logger.log(`  Email Provider: ${email.provider?.toUpperCase()}`);
    this.logger.log(`  Email Orders: ${emailAddr.orders}`);
    this.logger.log(`  Email Support: ${emailAddr.support}`);
    this.logger.log(`  Email Info: ${emailAddr.info}`);
    this.logger.log(`  Email Admin: ${emailAddr.admin}`);
  }
}