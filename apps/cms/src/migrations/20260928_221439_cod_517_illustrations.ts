import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_callout" ADD COLUMN "illustration" varchar;
  ALTER TABLE "payload"."pages_blocks_feature_section" ADD COLUMN "illustration" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "illustration" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD COLUMN "illustration" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" ADD COLUMN "illustration" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "illustration" varchar;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_callout" DROP COLUMN "illustration";
  ALTER TABLE "payload"."pages_blocks_feature_section" DROP COLUMN "illustration";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "illustration";
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP COLUMN "illustration";
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" DROP COLUMN "illustration";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "illustration";`);
}
