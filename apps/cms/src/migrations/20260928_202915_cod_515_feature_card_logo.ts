import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_feature_cards_logo_source" AS ENUM('svg', 'upload');
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" ADD COLUMN "brand_logo_source" "payload"."enum_feature_cards_logo_source";
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" ADD COLUMN "brand_logo_svg_code" varchar;
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" ADD COLUMN "brand_logo_file_id" integer;
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" ADD COLUMN "brand_logo_source" "payload"."enum_feature_cards_logo_source";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" ADD COLUMN "brand_logo_svg_code" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" ADD COLUMN "brand_logo_file_id" integer;
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" ADD CONSTRAINT "pages_blocks_feature_cards_items_brand_logo_file_id_media_id_fk" FOREIGN KEY ("brand_logo_file_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" ADD CONSTRAINT "_pages_v_blocks_feature_cards_items_brand_logo_file_id_media_id_fk" FOREIGN KEY ("brand_logo_file_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_feature_cards_items_brand_logo_brand_logo_f_idx" ON "payload"."pages_blocks_feature_cards_items" USING btree ("brand_logo_file_id");
  CREATE INDEX "_pages_v_blocks_feature_cards_items_brand_logo_brand_log_idx" ON "payload"."_pages_v_blocks_feature_cards_items" USING btree ("brand_logo_file_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_feature_cards_items" DROP CONSTRAINT "pages_blocks_feature_cards_items_brand_logo_file_id_media_id_fk";

  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" DROP CONSTRAINT "_pages_v_blocks_feature_cards_items_brand_logo_file_id_media_id_fk";

  DROP INDEX "payload"."pages_blocks_feature_cards_items_brand_logo_brand_logo_f_idx";
  DROP INDEX "payload"."_pages_v_blocks_feature_cards_items_brand_logo_brand_log_idx";
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" DROP COLUMN "brand_logo_source";
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" DROP COLUMN "brand_logo_svg_code";
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" DROP COLUMN "brand_logo_file_id";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" DROP COLUMN "brand_logo_source";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" DROP COLUMN "brand_logo_svg_code";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" DROP COLUMN "brand_logo_file_id";
  DROP TYPE "payload"."enum_feature_cards_logo_source";`);
}
