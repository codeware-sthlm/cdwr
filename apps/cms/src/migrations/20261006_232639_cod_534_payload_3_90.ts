import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "payload"."stock_media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."media" DROP COLUMN "_objectkey";
  ALTER TABLE "payload"."stock_media" DROP COLUMN "_objectkey";
  ALTER TABLE "payload"."users" DROP COLUMN "reset_password_requested_at";`);
}
