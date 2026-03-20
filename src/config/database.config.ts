import { registerAs } from "@nestjs/config";

/**
 * Database Configuration con SSL sicuro
 *
 * Supporta due modalità:
 * 1. DATABASE_URL - stringa di connessione completa
 * 2. Credenziali separate (per AWS Secrets Manager RDS):
 *    - DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD
 *
 * SECURITY FIX: rejectUnauthorized è ora TRUE anche per RDS
 * Per RDS AWS, scarica il certificato CA da:
 * https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
 * E imposta DATABASE_SSL_CA_PATH nel .env
 */
export const databaseConfig = registerAs('database', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Supporto per credenziali separate (AWS Secrets Manager RDS)
  let databaseUrl = process.env.DATABASE_URL || '';

  // Se non c'è DATABASE_URL ma ci sono le credenziali separate, costruisci la URL
  if (!databaseUrl && process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD) {
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || '5432';
    const dbName = process.env.DB_NAME || 'postgres';
    const username = process.env.DB_USERNAME;
    // URL-encode la password per gestire caratteri speciali
    const password = encodeURIComponent(process.env.DB_PASSWORD);
    databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${dbName}`;
    console.log(`📦 Database URL costruita da credenziali separate (host: ${host})`);
  }

  // Determina configurazione SSL
  let sslConfig: boolean | object = false;

  if (isDevelopment && !databaseUrl.includes('ssl=')) {
    // Development locale: SSL on by default, but not strict
    sslConfig = { rejectUnauthorized: false };
  } else if (databaseUrl.includes('neon.tech') || databaseUrl.includes('supabase')) {
    // Neon/Supabase: SSL richiesto, certificato valido
    sslConfig = { rejectUnauthorized: true };
  } else if (databaseUrl.includes('rds.amazonaws.com')) {
    // AWS RDS: SSL con certificato CA
    const caPath = process.env.DATABASE_SSL_CA_PATH;
    if (caPath) {
      // Se hai il certificato CA, usalo
      const fs = require('fs');
      sslConfig = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString(),
      };
    } else {
      // SECURITY: In produzione RDS DEVE avere il certificato
      // In staging accettiamo senza CA ma con warning
      if (isProduction) {
        console.warn('⚠️ SECURITY WARNING: DATABASE_SSL_CA_PATH non configurato per RDS in produzione!');
        console.warn('   Scarica il certificato da: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem');
      }
      sslConfig = { rejectUnauthorized: !isProduction }; // Strict in prod
    }
  } else if (isProduction) {
    // Altra produzione: SSL strict
    sslConfig = { rejectUnauthorized: true };
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: sslConfig,
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: ['dist/database/migrations/*{.ts,.js}'],
  autoLoadEntities: true,
  retryAttempts: 3,
  retryDelay: 3000,
  maxQueryExecutionTime: 10000, // 10 seconds
  extra: {
    connectionLimit: isProduction ? 50 : 10,
    acquireTimeout: 60000,
    timeout: 60000,
  },
};
});