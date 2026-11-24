import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_callout_mark_style" AS ENUM('brand', 'muted');
  CREATE TYPE "payload"."enum_tech_logo_color" AS ENUM('own', 'brand');
  ALTER TABLE "payload"."pages_blocks_callout" ADD COLUMN "mark_style" "payload"."enum_callout_mark_style" DEFAULT 'brand';
  ALTER TABLE "payload"."pages_blocks_feature_cards" ADD COLUMN "logo_color" "payload"."enum_tech_logo_color" DEFAULT 'own';
  ALTER TABLE "payload"."pages_blocks_pill_list" ADD COLUMN "logo_color" "payload"."enum_tech_logo_color" DEFAULT 'own';
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD COLUMN "mark_style" "payload"."enum_callout_mark_style" DEFAULT 'brand';
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards" ADD COLUMN "logo_color" "payload"."enum_tech_logo_color" DEFAULT 'own';
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" ADD COLUMN "logo_color" "payload"."enum_tech_logo_color" DEFAULT 'own';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_callout" DROP COLUMN "mark_style";
  ALTER TABLE "payload"."pages_blocks_feature_cards" DROP COLUMN "logo_color";
  ALTER TABLE "payload"."pages_blocks_pill_list" DROP COLUMN "logo_color";
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP COLUMN "mark_style";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards" DROP COLUMN "logo_color";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" DROP COLUMN "logo_color";
  DROP TYPE "payload"."enum_callout_mark_style";
  DROP TYPE "payload"."enum_tech_logo_color";`);
}
