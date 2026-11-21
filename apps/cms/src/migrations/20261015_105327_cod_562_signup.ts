import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_tenant_status" AS ENUM('pending', 'active');
  ALTER TABLE "payload"."platform_settings" ADD COLUMN "signup_notify_email" varchar;
  ALTER TABLE "payload"."tenants" ADD COLUMN "status" "payload"."enum_tenant_status" DEFAULT 'active' NOT NULL;
  ALTER TABLE "payload"."users" ADD COLUMN "_verified" boolean;
  ALTER TABLE "payload"."users" ADD COLUMN "_verificationtoken" varchar;
  UPDATE "payload"."users" SET "_verified" = true;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."platform_settings" DROP COLUMN IF EXISTS "signup_notify_email";
  ALTER TABLE "payload"."tenants" DROP COLUMN IF EXISTS "status";
  ALTER TABLE "payload"."users" DROP COLUMN IF EXISTS "_verified";
  ALTER TABLE "payload"."users" DROP COLUMN IF EXISTS "_verificationtoken";
  DROP TYPE IF EXISTS "payload"."enum_tenant_status";`);
}
