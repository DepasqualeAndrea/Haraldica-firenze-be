import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSizes1770000000001 implements MigrationInterface {
  name = 'AddProductSizes1770000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "sizes" text[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "sizes"
    `);
  }
}
