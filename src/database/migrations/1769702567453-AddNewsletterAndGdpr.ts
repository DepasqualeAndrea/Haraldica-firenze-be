import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNewsletterAndGdpr1769702567453 implements MigrationInterface {
    name = 'AddNewsletterAndGdpr1769702567453'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."newsletters_status_enum" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "newsletters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subject" character varying NOT NULL, "content" text NOT NULL, "previewText" text, "status" "public"."newsletters_status_enum" NOT NULL DEFAULT 'draft', "ctaText" character varying, "ctaUrl" character varying, "headerImage" character varying, "scheduledAt" TIMESTAMP, "sentAt" TIMESTAMP, "recipientCount" integer NOT NULL DEFAULT '0', "sentCount" integer NOT NULL DEFAULT '0', "failedCount" integer NOT NULL DEFAULT '0', "openCount" integer NOT NULL DEFAULT '0', "clickCount" integer NOT NULL DEFAULT '0', "targetAudience" jsonb, "discountCode" jsonb, "createdBy" character varying, "campaignName" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b63ff3417bbaa6c92061b9f6934" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_071055f7c7cede2137aa68f8a1" ON "newsletters" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_7dc241c27391a1534aa97eb823" ON "newsletters" ("scheduledAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_dafe00e21339a765db5066ea34" ON "newsletters" ("status") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "adminId" uuid, "adminEmail" character varying, "action" character varying(50) NOT NULL, "severity" character varying(20) NOT NULL DEFAULT 'info', "entityType" character varying, "entityId" character varying, "description" text NOT NULL, "previousData" jsonb, "newData" jsonb, "metadata" jsonb, "ipAddress" character varying, "userAgent" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9d53d8c4d4227c02e4476129d2" ON "audit_logs" ("adminId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_f23279fad63453147a8efb46cf" ON "audit_logs" ("entityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON "audit_logs" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_5fed71356a22964650a661558f" ON "audit_logs" ("severity", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_13c69424c440a0e765053feb4b" ON "audit_logs" ("entityType", "entityId") `);
        await queryRunner.query(`CREATE INDEX "IDX_01819a7b970174c1316f32a2c2" ON "audit_logs" ("adminId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0ec936941eb8556fcd7a1f0eae" ON "audit_logs" ("action", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD "lockedPrice" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD "priceLockTimestamp" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "galleryImages" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "keyIngredients" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "productFaqs" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "bundleProducts" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "ratingDistribution" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "topReviews" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "stockAlerts" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_9d53d8c4d4227c02e4476129d25" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_9d53d8c4d4227c02e4476129d25"`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "stockAlerts" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "topReviews" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "ratingDistribution" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "bundleProducts" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "productFaqs" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "keyIngredients" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "galleryImages" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "priceLockTimestamp"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "lockedPrice"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0ec936941eb8556fcd7a1f0eae"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01819a7b970174c1316f32a2c2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_13c69424c440a0e765053feb4b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5fed71356a22964650a661558f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c69efb19bf127c97e6740ad530"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f23279fad63453147a8efb46cf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9d53d8c4d4227c02e4476129d2"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dafe00e21339a765db5066ea34"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7dc241c27391a1534aa97eb823"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_071055f7c7cede2137aa68f8a1"`);
        await queryRunner.query(`DROP TABLE "newsletters"`);
        await queryRunner.query(`DROP TYPE "public"."newsletters_status_enum"`);
    }

}
