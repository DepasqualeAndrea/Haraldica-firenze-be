import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  
  // ✅ Validazione JWT secret
  if (!secret) {
    throw new Error('JWT_SECRET è richiesta nelle variabili ambiente');
  }
  
  if (secret.length < 32) {
    throw new Error('JWT_SECRET deve essere di almeno 32 caratteri per sicurezza');
  }

  // ✅ Validazione formato expiresIn
  const validTimeFormats = /^(\d+[smhdw]|\d+)$/;
  if (!validTimeFormats.test(expiresIn)) {
    throw new Error('JWT_EXPIRES_IN deve essere in formato valido (es: 24h, 7d, 3600)');
  }

  return {
    secret,
    expiresIn,
    refreshExpiresIn: '7d',
    issuer: 'haraldicafirenze-api',
    audience: 'haraldicafirenze-app',
  };
});