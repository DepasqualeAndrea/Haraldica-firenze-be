import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refactor ProductVariant: da (size, stock, reservedStock) a stockPerSize JSONB.
 *
 * Migrazione dei dati esistenti:
 *   Prima:  variant { size: "L", stock: 10, reservedStock: 2 }
 *   Dopo:   variant { stockPerSize: { "L": 8 } }  (stock - reservedStock)
 */
export class RefactorVariantStockPerSize1770000000002 implements MigrationInterface {
  name = 'RefactorVariantStockPerSize1770000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Aggiungi colonna stockPerSize
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "stockPerSize" jsonb NOT NULL DEFAULT '{}'
    `);

    // 2. Migra i dati esistenti: size + stock → stockPerSize
    await queryRunner.query(`
      UPDATE "product_variants"
      SET "stockPerSize" = jsonb_build_object(
        "size",
        GREATEST(0, COALESCE("stock", 0) - COALESCE("reservedStock", 0))
      )
      WHERE "size" IS NOT NULL AND "stockPerSize" = '{}'
    `);

    // 3. Aggiungi size a cart_items
    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD COLUMN IF NOT EXISTS "size" character varying NOT NULL DEFAULT ''
    `);

    // 4. Aggiungi size e colorName a order_items
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "size" character varying NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "colorName" character varying NULL
    `);

    // 5. Rimuovi vincolo unique (cartId, variantId) e crea (cartId, variantId, size)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_cart_items_cart_variant"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cart_items_cart_variant_size"
      ON "cart_items" ("cartId", "variantId", "size")
    `);

    // 6. Rimuovi i CHECK constraint che riferiscono stock/reservedStock
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP CONSTRAINT IF EXISTS "CHK_stock_gte_0"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP CONSTRAINT IF EXISTS "CHK_reservedStock_gte_0"
    `);

    // NOTA: le colonne size, stock, reservedStock vengono mantenute come nullable
    // per backward compat. Rimuoverle in una migration successiva dopo verifica.
    await queryRunner.query(`ALTER TABLE "product_variants" ALTER COLUMN "size" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "product_variants" ALTER COLUMN "stock" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "product_variants" ALTER COLUMN "reservedStock" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "stockPerSize"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "size"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "size"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "colorName"`);
  }
}
