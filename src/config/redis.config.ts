import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '', 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '', 10) || 0,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  keyPrefix: 'haraldicafirenze:',
  
  // Connection options
  retryStrategy: (times: number) => {
    // In produzione riprova con backoff; in dev fallisce veloce
    if (process.env.NODE_ENV === 'production') {
      return Math.min(times * 200, 5000);
    }
    // Dev: riprova solo 3 volte poi smette (non blocca il server)
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
  maxRetriesPerRequest: 1,   // era 3 → fail veloce invece di 3 tentativi
  enableReadyCheck: false,   // era true → non bloccare se Redis non è ready
  enableOfflineQueue: false, // era true → CRITICO: comandi falliscono subito invece di aspettare 10s
  connectTimeout: 2000,      // era 10000 → 2s max invece di 10s
  
  // Bull Queue specific config
  bull: {
    host: process.env.BULL_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.BULL_REDIS_PORT ?? '', 10) || parseInt(process.env.REDIS_PORT ?? '', 10) || 6379,
    password: process.env.BULL_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.BULL_REDIS_DB ?? '', 10) || 1,
  },
}));