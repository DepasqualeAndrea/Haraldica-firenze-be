import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';

async function clearCategories() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('🗑️  Cancellazione categorie esistenti...\n');

    // Prima conta le categorie esistenti
    const countResult = await dataSource.query('SELECT COUNT(*) FROM categories');
    const count = parseInt(countResult[0].count);

    console.log(`📦 Trovate ${count} categorie da eliminare\n`);

    if (count === 0) {
      console.log('✅ Nessuna categoria da eliminare.\n');
      return;
    }

    // Elimina tutte le categorie (CASCADE gestisce le relazioni)
    await dataSource.query('DELETE FROM categories');

    console.log(`✅ ${count} categorie eliminate con successo!\n`);
    console.log('🚀 Ora puoi eseguire: npm run seed:categories\n');

  } catch (error) {
    console.error('💥 Errore durante la cancellazione:', error);
  } finally {
    await app.close();
  }
}

clearCategories();
