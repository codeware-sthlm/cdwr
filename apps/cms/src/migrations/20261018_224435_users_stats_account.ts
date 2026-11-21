import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" ADD COLUMN "stats_account_umami_user_id" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "stats_account_created_at" timestamp(3) with time zone;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" DROP COLUMN "stats_account_umami_user_id";
  ALTER TABLE "payload"."users" DROP COLUMN "stats_account_created_at";`);
}
