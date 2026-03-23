import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullSpecProductFields1769900000000 implements MigrationInterface {
  name = 'AddFullSpecProductFields1769900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. PRODUCTS — new scalar columns ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "vendor"           VARCHAR,
        ADD COLUMN IF NOT EXISTS "product_type"     VARCHAR,
        ADD COLUMN IF NOT EXISTS "currency"         VARCHAR(3) DEFAULT 'EUR',
        ADD COLUMN IF NOT EXISTS "tags"             TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS "published_at"     TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "description_html" TEXT
    `);

    // ── 2. PRODUCTS — new JSONB columns ──────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "details"           JSONB,
        ADD COLUMN IF NOT EXISTS "size_fit"          JSONB,
        ADD COLUMN IF NOT EXISTS "fabric_care"       JSONB,
        ADD COLUMN IF NOT EXISTS "shipping_returns"  JSONB
    `);

    // ── 3. GIN indexes ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_tags"
        ON "products" USING GIN ("tags")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_products_details"
        ON "products" USING GIN ("details")
    `);

    // ── 4. PRODUCT_VARIANTS — new columns ────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN IF NOT EXISTS "barcode"      VARCHAR,
        ADD COLUMN IF NOT EXISTS "weight"       NUMERIC(8,3),
        ADD COLUMN IF NOT EXISTS "weight_unit"  VARCHAR(2) DEFAULT 'kg'
    `);

    // ── 5. Partial unique index on barcode (NULL rows exempt) ─────────────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_variants_barcode"
        ON "product_variants" ("barcode")
        WHERE "barcode" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_details"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_products_tags"`);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP COLUMN IF EXISTS "barcode",
        DROP COLUMN IF EXISTS "weight",
        DROP COLUMN IF EXISTS "weight_unit"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN IF EXISTS "shipping_returns",
        DROP COLUMN IF EXISTS "fabric_care",
        DROP COLUMN IF EXISTS "size_fit",
        DROP COLUMN IF EXISTS "details",
        DROP COLUMN IF EXISTS "description_html",
        DROP COLUMN IF EXISTS "published_at",
        DROP COLUMN IF EXISTS "tags",
        DROP COLUMN IF EXISTS "currency",
        DROP COLUMN IF EXISTS "product_type",
        DROP COLUMN IF EXISTS "vendor"
    `);
  }
}
