import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."platform_settings" ADD COLUMN "idle_workspace_days" numeric;
  ALTER TABLE "payload"."tenants" ADD COLUMN "idle_warned_at" timestamp(3) with time zone;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."platform_settings" DROP COLUMN "idle_workspace_days";
  ALTER TABLE "payload"."tenants" DROP COLUMN "idle_warned_at";`);
}
