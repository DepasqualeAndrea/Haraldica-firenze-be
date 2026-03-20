import { registerAs } from '@nestjs/config';

export default registerAs('email', () => {
  const provider = process.env.EMAIL_PROVIDER || 'ses';
  const brandName = process.env.EMAIL_BRAND_NAME || 'Haraldica Firenze';

  // ===========================
  // EMAIL ADDRESSES
  // ===========================
  const emailAddresses = {
    from: process.env.EMAIL_FROM || 'noreply@haraldicafirenze.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Haraldica Firenze',
    orders: process.env.EMAIL_ORDERS || 'ordini@haraldicafirenze.com',
    support: process.env.EMAIL_SUPPORT || 'supporto@haraldicafirenze.com',
    info: process.env.EMAIL_INFO || 'info@haraldicafirenze.com',
    admin: process.env.EMAIL_ADMIN || 'amministrazione@haraldicafirenze.com',
  };

  // ===========================
  // AWS SES CONFIGURATION
  // ===========================
  const useIamRole = process.env.AWS_SES_USE_IAM_ROLE === 'true';
  const ses = {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
    region: process.env.AWS_SES_REGION || 'eu-central-1',
  };

  // ✅ Validazione AWS SES (solo se provider è 'ses')
  if (provider === 'ses') {
    if (!useIamRole && !ses.accessKeyId) {
      throw new Error('AWS_SES_ACCESS_KEY_ID è richiesta quando EMAIL_PROVIDER=ses');
    }
    if (!useIamRole && !ses.secretAccessKey) {
      throw new Error('AWS_SES_SECRET_ACCESS_KEY è richiesta quando EMAIL_PROVIDER=ses');
    }
    console.log('✅ AWS SES configurato correttamente');
  }

  // ===========================
  // RESEND CONFIGURATION (Fallback)
  // ===========================
  const resend = {
    apiKey: process.env.RESEND_API_KEY,
  };

  // ===========================
  // SMTP CONFIGURATION (Optional)
  // ===========================
  const smtp = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };

  // ===========================
  // RATE LIMITING & RETRY
  // ===========================
  const rateLimiting = {
    perSecond: parseInt(process.env.EMAIL_RATE_LIMIT_PER_SECOND || '10', 10),
    retryAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3', 10),
    maxBatchSize: parseInt(process.env.EMAIL_MAX_BATCH_SIZE || '50', 10),
  };

  return {
    provider, // 'ses' | 'resend' | 'smtp'
    brandName,
    addresses: emailAddresses,
    ses: { ...ses, useIamRole },
    resend,
    smtp,
    rateLimiting,
  };
});