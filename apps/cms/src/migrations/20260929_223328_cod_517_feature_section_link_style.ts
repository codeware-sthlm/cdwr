import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_feature_section_link_style" AS ENUM('button', 'text');
  CREATE TYPE "payload"."enum__pages_v_blocks_feature_section_link_style" AS ENUM('button', 'text');
  ALTER TABLE "payload"."pages_blocks_feature_section" ADD COLUMN "link_style" "payload"."enum_pages_blocks_feature_section_link_style" DEFAULT 'button';
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" ADD COLUMN "link_style" "payload"."enum__pages_v_blocks_feature_section_link_style" DEFAULT 'button';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_feature_section" DROP COLUMN "link_style";
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" DROP COLUMN "link_style";
  DROP TYPE "payload"."enum_pages_blocks_feature_section_link_style";
  DROP TYPE "payload"."enum__pages_v_blocks_feature_section_link_style";`);
}
