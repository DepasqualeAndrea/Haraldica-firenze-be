import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImages1770000000000 implements MigrationInterface {
  name = 'AddProductImages1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "images" text[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "images"
    `);
  }
}
