import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import fs from 'fs';

// Load environment variables
config();

const databaseUrl = process.env.DATABASE_URL || '';
const sslEnv = (process.env.DATABASE_SSL || '').toLowerCase();
const hasSslInUrl = /sslmode=require|ssl=true|ssl=1/i.test(databaseUrl);
const sslEnabled = sslEnv === 'true' || hasSslInUrl || process.env.NODE_ENV === 'production';

let sslConfig: boolean | object = false;
if (sslEnabled) {
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (caPath) {
    sslConfig = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caPath).toString(),
    };
  } else {
    sslConfig = {
      rejectUnauthorized: (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false',
    };
  }
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  ssl: sslConfig,
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
  synchronize: false, // ✅ CRITICAL: Always false for migrations
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
});
