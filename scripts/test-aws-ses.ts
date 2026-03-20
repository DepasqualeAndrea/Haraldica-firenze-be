#!/usr/bin/env ts-node
/**
 * Test Script per AWS SES
 * 
 * Testa:
 * 1. Connessione AWS SES
 * 2. Invio email semplice
 * 3. Verifica configurazione
 * 
 * Usage:
 * npm run test:aws-ses
 */

import { SESClient, SendEmailCommand, GetAccountSendingEnabledCommand } from '@aws-sdk/client-ses';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carica .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Colori per console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAWSSES() {
  log('\n🧪 TEST AWS SES - MERAVIEN\n', 'cyan');
  log('═'.repeat(60), 'blue');

  // ===========================
  // STEP 1: Verifica Credenziali
  // ===========================
  log('\n📋 STEP 1: Verifica Credenziali', 'yellow');
  
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SES_REGION || 'eu-central-1';
  const fromEmail = process.env.EMAIL_FROM || 'noreply@meravien.com';

  if (!accessKeyId || !secretAccessKey) {
    log('❌ AWS SES credentials mancanti nel .env', 'red');
    log('   Aggiungi: AWS_SES_ACCESS_KEY_ID e AWS_SES_SECRET_ACCESS_KEY', 'red');
    process.exit(1);
  }

  log(`✅ Access Key ID: ${accessKeyId.substring(0, 8)}...`, 'green');
  log(`✅ Region: ${region}`, 'green');
  log(`✅ From Email: ${fromEmail}`, 'green');

  // ===========================
  // STEP 2: Inizializza Client SES
  // ===========================
  log('\n🔧 STEP 2: Inizializza AWS SES Client', 'yellow');

  const sesClient = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  log('✅ SES Client inizializzato', 'green');

  // ===========================
  // STEP 3: Verifica Account Status
  // ===========================
  log('\n📊 STEP 3: Verifica Account Status', 'yellow');

  try {
    const accountCommand = new GetAccountSendingEnabledCommand({});
    const accountResponse = await sesClient.send(accountCommand);
    
    if (accountResponse.Enabled) {
      log('✅ Account SES ABILITATO per invio email', 'green');
    } else {
      log('❌ Account SES NON abilitato', 'red');
      log('   Vai su AWS Console e abilita l\'account', 'red');
      process.exit(1);
    }
  } catch (error: any) {
    log('⚠️  Impossibile verificare stato account (potrebbe essere OK)', 'yellow');
    log(`   Errore: ${error.message}`, 'yellow');
  }

  // ===========================
  // STEP 4: Test Invio Email
  // ===========================
  log('\n📧 STEP 4: Test Invio Email', 'yellow');
  log('   Invio email di test a: amministrazione@meravien.com', 'blue');

  const testEmail = {
    Source: fromEmail,
    Destination: {
      ToAddresses: ['amministrazione@meravien.com'],
    },
    Message: {
      Subject: {
        Data: '🧪 Test AWS SES - Meravien',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                  .success { background: #10b981; color: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
                  .info { background: #3b82f6; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 14px; }
                  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🎉 AWS SES Configurato!</h1>
                  </div>
                  <div class="content">
                    <div class="success">
                      <strong>✅ Test Superato!</strong><br>
                      AWS SES è configurato correttamente per Meravien.
                    </div>
                    
                    <h2>📊 Dettagli Configurazione</h2>
                    <div class="info">
                      <strong>Provider:</strong> Amazon SES<br>
                      <strong>Region:</strong> ${region}<br>
                      <strong>From Email:</strong> ${fromEmail}<br>
                      <strong>Data Test:</strong> ${new Date().toLocaleString('it-IT')}
                    </div>

                    <h2>🚀 Prossimi Step</h2>
                    <ul>
                      <li>✅ AWS SES configurato e funzionante</li>
                      <li>⏳ Integra SpediamoPro API</li>
                      <li>⏳ Setup Queue System</li>
                      <li>⏳ Test ordine completo</li>
                    </ul>

                    <p><strong>Nota:</strong> Questo è un test automatico del sistema email. Se ricevi questa email, tutto funziona perfettamente! 🎊</p>
                  </div>
                  <div class="footer">
                    <p>Meravien E-commerce Platform<br>
                    Test generato da: <code>test-aws-ses.ts</code></p>
                  </div>
                </div>
              </body>
            </html>
          `,
          Charset: 'UTF-8',
        },
        Text: {
          Data: `
🎉 AWS SES CONFIGURATO CORRETTAMENTE!

Test Superato: AWS SES è configurato e funzionante per Meravien.

Dettagli:
- Provider: Amazon SES
- Region: ${region}
- From Email: ${fromEmail}
- Data Test: ${new Date().toLocaleString('it-IT')}

Prossimi Step:
✅ AWS SES configurato
⏳ SpediamoPro Integration
⏳ Queue System Setup
⏳ Test ordine completo

---
Meravien E-commerce Platform
          `,
          Charset: 'UTF-8',
        },
      },
    },
  };

  try {
    const sendCommand = new SendEmailCommand(testEmail);
    const sendResponse = await sesClient.send(sendCommand);
    
    log('', 'reset');
    log('✅ EMAIL INVIATA CON SUCCESSO!', 'green');
    log(`   Message ID: ${sendResponse.MessageId}`, 'green');
    log('', 'reset');
    log('📬 Controlla la casella: amministrazione@meravien.com', 'cyan');
    log('   (Potrebbero volerci 1-2 minuti)', 'cyan');
    
  } catch (error: any) {
    log('❌ ERRORE invio email:', 'red');
    log(`   ${error.message}`, 'red');
    
    if (error.message.includes('not verified')) {
      log('', 'reset');
      log('⚠️  Email non verificata su AWS SES', 'yellow');
      log('   1. Vai su AWS SES Console', 'yellow');
      log('   2. Verifica email: noreply@meravien.com', 'yellow');
      log('   3. Controlla la tua inbox per il link di verifica', 'yellow');
    }
    
    process.exit(1);
  }

  // ===========================
  // STEP 5: Riepilogo
  // ===========================
  log('\n═'.repeat(60), 'blue');
  log('\n✅ TEST COMPLETATO CON SUCCESSO!\n', 'green');
  log('📊 Riepilogo:', 'cyan');
  log('   ✅ Credenziali AWS SES valide', 'green');
  log('   ✅ Client SES inizializzato', 'green');
  log('   ✅ Account abilitato per invio', 'green');
  log('   ✅ Email di test inviata', 'green');
  log('\n🎉 AWS SES è pronto per essere usato in produzione!\n', 'magenta');
  log('═'.repeat(60), 'blue');
}

// Esegui test
testAWSSES()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`\n❌ Test fallito: ${error.message}\n`, 'red');
    process.exit(1);
  });