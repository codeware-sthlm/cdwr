import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_settings_chrome" AS ENUM('outlined', 'flat');
  ALTER TABLE "payload"."site_settings" ADD COLUMN "general_chrome" "payload"."enum_site_settings_chrome" DEFAULT 'outlined' NOT NULL;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_settings" DROP COLUMN "general_chrome";
  DROP TYPE "payload"."enum_site_settings_chrome";`);
}
