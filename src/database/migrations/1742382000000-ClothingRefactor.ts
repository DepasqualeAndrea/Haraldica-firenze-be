import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClothingRefactor1742382000000 implements MigrationInterface {
  name = 'ClothingRefactor1742382000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ────────────────────────────────────────────────────────────────────────
    // 1. USERS — add Supabase columns
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "supabase_id" UUID UNIQUE,
        ADD COLUMN IF NOT EXISTS "is_two_factor_enabled" BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 2. PRODUCT_VARIANTS — new table
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variants" (
        "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id"             UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "sku"                    VARCHAR NOT NULL UNIQUE,
        "size"                   VARCHAR NOT NULL,
        "color_name"             VARCHAR NOT NULL,
        "color_hex"              CHAR(7) NOT NULL,
        "stock"                  INTEGER NOT NULL DEFAULT 0 CHECK ("stock" >= 0),
        "reserved_stock"         INTEGER NOT NULL DEFAULT 0 CHECK ("reserved_stock" >= 0),
        "variant_price_override" NUMERIC(10,2) CHECK ("variant_price_override" >= 0),
        "images"                 JSONB NOT NULL DEFAULT '[]',
        "is_active"              BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"             TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id" ON "product_variants" ("product_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_product_variants_sku" ON "product_variants" ("sku")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_product_variants_is_active" ON "product_variants" ("is_active")`);

    // ────────────────────────────────────────────────────────────────────────
    // 3. PRODUCTS — rename price → base_price, add clothing fields, drop cosmetics
    // ────────────────────────────────────────────────────────────────────────

    // 3a. Rename price column
    await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "price" TO "base_price"`);

    // 3b. Add clothing-specific columns
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "materials"          TEXT,
        ADD COLUMN IF NOT EXISTS "fit"                VARCHAR,
        ADD COLUMN IF NOT EXISTS "origin"             VARCHAR NOT NULL DEFAULT 'Made in Italy',
        ADD COLUMN IF NOT EXISTS "care_instructions"  TEXT,
        ADD COLUMN IF NOT EXISTS "product_line"       VARCHAR
    `);

    // 3c. Drop cosmetics columns (best-effort — skip if they don't exist)
    const cosmeticColumns = [
      'volume_ml', 'weight_grams', 'expiry_date', 'pao', 'ingredients',
      'cosmetic_details', 'key_ingredients', 'product_faqs', 'bundle_products',
      'rating_distribution', 'top_reviews', 'stock_alerts', 'sku', 'brand',
      'brand_slug', 'original_price', 'stock', 'reserved_stock',
      'track_inventory', 'low_stock_threshold', 'stripe_metadata',
      'stripe_price_id', 'is_fragile', 'requires_refrigeration',
      'gallery_images', 'video_url', 'restock_date', 'weight',
    ];
    for (const col of cosmeticColumns) {
      await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "${col}"`).catch(() => {});
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. CART_ITEMS — productId → variantId
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "uq_cart_product"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_product_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "cart_items" RENAME COLUMN "product_id" TO "variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "cart_items_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "uq_cart_variant" UNIQUE ("cart_id", "variant_id")
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 5. ORDER_ITEMS — productId → variantId
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "order_items" RENAME COLUMN "product_id" TO "variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "order_items_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 6. STOCK_RESERVATIONS — productId → variantId
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "stock_reservations_product_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "uq_order_product"`);
    await queryRunner.query(`ALTER TABLE "stock_reservations" RENAME COLUMN "product_id" TO "variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "stock_reservations"
        ADD CONSTRAINT "stock_reservations_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_reservations"
        ADD CONSTRAINT "uq_order_variant" UNIQUE ("order_id", "variant_id")
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 7. INVENTORY_MOVEMENTS — productId → variantId
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_product_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" RENAME COLUMN "product_id" TO "variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
        ADD CONSTRAINT "inventory_movements_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 8. RETURN_ITEMS — productId → variantId
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "return_items" DROP CONSTRAINT IF EXISTS "return_items_product_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "return_items" RENAME COLUMN "product_id" TO "variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "return_items"
        ADD CONSTRAINT "return_items_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
    `);

    // ────────────────────────────────────────────────────────────────────────
    // 9. CATEGORIES — drop cosmetic columns, add clothing_type
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "cosmetic_type"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "cosmetic_attributes"`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "clothing_type" VARCHAR`);

    // ────────────────────────────────────────────────────────────────────────
    // 10. SIZE_GUIDES — new table
    // ────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "size_system_enum" AS ENUM ('eu', 'it', 'uk', 'us', 'universal');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "size_guides" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "category_id"    UUID NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
        "title"          VARCHAR(120) NOT NULL,
        "rows"           JSONB NOT NULL DEFAULT '[]',
        "primary_system" "size_system_enum" NOT NULL DEFAULT 'eu',
        "notes"          TEXT,
        "created_at"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_size_guides_category_id" ON "size_guides" ("category_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse in reverse order (simplified — run only if rollback is needed)

    await queryRunner.query(`DROP TABLE IF EXISTS "size_guides"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "size_system_enum"`);

    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "clothing_type"`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "cosmetic_type" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "cosmetic_attributes" JSONB`);

    // Note: productId renames are intentionally omitted from down() as they
    // require data migration and the original constraints are not restored.
    // Restore from backup if full rollback is needed.

    await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "base_price" TO "price"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "materials"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "fit"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "origin"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "care_instructions"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "product_line"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "supabase_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_two_factor_enabled"`);
  }
}
