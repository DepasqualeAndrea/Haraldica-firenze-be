// scripts/seed-admin-user.ts
// Seed script per creare utenti admin e test

import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';
import { User, UserRole } from 'src/database/entities/user.entity';
import { PasswordUtil } from 'src/utils/password.util';

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  isEmailVerified?: boolean;
  marketingConsent?: boolean;
}

async function seedAdminUser() {
  console.log('🌱 Avvio seed utenti admin e test...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const userRepository = dataSource.getRepository(User);

  try {
    // Definizione utenti da creare
    const usersToCreate: SeedUser[] = [
      // Admin principale
      {
        email: 'admin@meravien.com',
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin123!@#',
        firstName: 'Admin',
        lastName: 'Meravien',
        role: UserRole.ADMIN,
        phone: '+39 02 1234567',
        isEmailVerified: true,
        marketingConsent: false,
      },
      // Admin secondario
      {
        email: 'support@meravien.com',
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'Support123!@#',
        firstName: 'Support',
        lastName: 'Team',
        role: UserRole.ADMIN,
        phone: '+39 02 7654321',
        isEmailVerified: true,
        marketingConsent: false,
      },
      // Utente test customer
      {
        email: 'test@meravien.com',
        password: 'Test123!@#',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.CUSTOMER,
        phone: '+39 333 1234567',
        isEmailVerified: true,
        marketingConsent: true,
      },
      // Utente test VIP (molti ordini)
      {
        email: 'vip@meravien.com',
        password: 'Vip123!@#',
        firstName: 'Maria',
        lastName: 'Rossi',
        role: UserRole.CUSTOMER,
        phone: '+39 333 9876543',
        isEmailVerified: true,
        marketingConsent: true,
      },
      // Utente test nuovo
      {
        email: 'nuovo@meravien.com',
        password: 'Nuovo123!@#',
        firstName: 'Giulia',
        lastName: 'Bianchi',
        role: UserRole.CUSTOMER,
        phone: '+39 333 5555555',
        isEmailVerified: false, // Email non verificata
        marketingConsent: false,
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    console.log('📋 Utenti da processare:', usersToCreate.length, '\n');

    for (const userData of usersToCreate) {
      try {
        // Verifica se l'utente esiste già
        const existing = await userRepository.findOne({
          where: { email: userData.email.toLowerCase() },
        });

        if (existing) {
          console.log(`⏭️  Skipped (già esistente): ${userData.email} [${userData.role}]`);
          skippedCount++;
          continue;
        }

        // Hash della password
        const hashedPassword = await PasswordUtil.hash(userData.password);

        // Crea l'utente
        const user = userRepository.create({
          email: userData.email.toLowerCase(),
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          phone: userData.phone,
          isActive: true,
          isEmailVerified: userData.isEmailVerified ?? true,
          marketingConsent: userData.marketingConsent ?? false,
          totalOrders: 0,
          totalSpent: 0,
          preferredLanguage: 'it',
        });

        await userRepository.save(user);
        console.log(`✅ Creato: ${userData.email} [${userData.role}]`);
        createdCount++;

      } catch (error) {
        console.error(`❌ Errore creazione ${userData.email}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 RIEPILOGO SEED UTENTI');
    console.log('='.repeat(50));
    console.log(`✅ Creati:    ${createdCount}`);
    console.log(`⏭️  Skippati: ${skippedCount}`);
    console.log(`❌ Errori:    ${errorCount}`);
    console.log('='.repeat(50));

    // Credenziali per il deploy
    if (createdCount > 0) {
      console.log('\n🔑 CREDENZIALI ADMIN (da cambiare dopo primo login):');
      console.log('─'.repeat(50));
      console.log('Email:    admin@meravien.com');
      console.log('Password: Admin123!@# (o valore di ADMIN_DEFAULT_PASSWORD)');
      console.log('─'.repeat(50));
      console.log('\n⚠️  IMPORTANTE: Cambia la password admin dopo il primo accesso!');
    }

  } catch (error) {
    console.error('\n❌ Errore fatale durante il seed:', error);
    process.exit(1);
  } finally {
    await app.close();
    console.log('\n🏁 Seed completato.\n');
  }
}

// Esecuzione
seedAdminUser();
