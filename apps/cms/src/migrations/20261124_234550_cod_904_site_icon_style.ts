import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_settings_icon_style" AS ENUM('own', 'brand', 'muted');
  ALTER TABLE "payload"."site_settings" ADD COLUMN "general_icon_style" "payload"."enum_site_settings_icon_style" DEFAULT 'own';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_settings" DROP COLUMN "general_icon_style";
  DROP TYPE "payload"."enum_site_settings_icon_style";`);
}
