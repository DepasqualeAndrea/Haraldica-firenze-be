import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { CategoriesService } from 'src/modules/admin-api/categories/categories.service';
import { CreateCategoryDto } from 'src/modules/admin-api/categories/dto/create-category.dto';
import { ClothingCategory } from 'src/database/enums/clothing-category.enum';

async function seedCategories() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoriesService = app.get(CategoriesService);

  try {
    console.log('🌱 Seeding Categorie Haraldica Firenze...\n');

    const existing = await categoriesService.findAll();
    if (existing.total > 0) {
      console.log(`⚠️  Trovate ${existing.total} categorie esistenti. Skip.`);
      await app.close();
      return;
    }

    const categories: CreateCategoryDto[] = [
      {
        name: 'Camicie', description: 'Camicie eleganti in lino, cotone e seta. Artigianato fiorentino.',
        slug: 'camicie', sortOrder: 10, isActive: true, parentId: '',
        clothingType: ClothingCategory.SHIRTS,
        metaTitle: 'Camicie Eleganti | Haraldica Firenze',
        metaDescription: 'Camicie artigianali in lino, cotone e seta. Spedizione gratuita oltre €200.',
      },
      {
        name: 'Cappotti', description: 'Cappotti e soprabiti in lana e cachemire. Sartoria fiorentina.',
        slug: 'cappotti', sortOrder: 20, isActive: true, parentId: '',
        clothingType: ClothingCategory.COATS,
        metaTitle: 'Cappotti Sartoriali | Haraldica Firenze',
        metaDescription: 'Cappotti artigianali in lana e cachemire. Eleganza italiana.',
      },
      {
        name: 'Cachemire', description: 'Maglieria e accessori in puro cachemire.',
        slug: 'cachemire', sortOrder: 30, isActive: true, parentId: '',
        clothingType: ClothingCategory.CASHMERE,
        metaTitle: 'Cachemire Puro | Haraldica Firenze',
        metaDescription: 'Maglieria in puro cachemire. La qualità che si sente sulla pelle.',
      },
      {
        name: 'Scarpe', description: 'Calzature artigianali in pelle pregiata fatte a mano.',
        slug: 'scarpe', sortOrder: 40, isActive: true, parentId: '',
        clothingType: ClothingCategory.SHOES,
        metaTitle: 'Scarpe Artigianali | Haraldica Firenze',
        metaDescription: 'Calzature di lusso fatte a mano a Firenze. Derby, mocassini e stivali.',
      },
      {
        name: 'Cinture', description: 'Cinture in pelle conciata al vegetale con fibbie in ottone.',
        slug: 'cinture', sortOrder: 50, isActive: true, parentId: '',
        clothingType: ClothingCategory.BELTS,
        metaTitle: 'Cinture Pelle | Haraldica Firenze',
        metaDescription: 'Cinture artigianali in pelle conciata al vegetale. Made in Firenze.',
      },
      {
        name: 'Accessori', description: 'Cravatte, pochette, guanti e accessori di lusso.',
        slug: 'accessori', sortOrder: 60, isActive: true, parentId: '',
        clothingType: ClothingCategory.ACCESSORIES,
        metaTitle: 'Accessori di Lusso | Haraldica Firenze',
        metaDescription: 'Cravatte in seta, pochette, guanti. Accessori esclusivi per l\'uomo elegante.',
      },
    ];

    for (const cat of categories) {
      const created = await categoriesService.create(cat);
      console.log(`✅ ${created.name} (${created.slug})`);
    }

    console.log(`\n✅ Seeding completato: ${categories.length} categorie.\n`);
  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

seedCategories();
