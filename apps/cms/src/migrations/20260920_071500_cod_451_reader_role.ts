import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // `IF NOT EXISTS` keeps this re-runnable on a single connection, which
  // `nx verify cms` relies on when it re-applies the last migration.
  await db.execute(sql`
   ALTER TYPE "payload"."enum_tenant_user_role" ADD VALUE IF NOT EXISTS 'reader';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  // Reader memberships are dropped rather than demoted. Mapping them to 'user'
  // would hand a reader editor rights on the way down — losing access is the
  // safe direction, gaining it is not.
  await db.execute(sql`
   DELETE FROM "payload"."users_tenants" WHERE "role" = 'reader';
  ALTER TABLE "payload"."users_tenants" ALTER COLUMN "role" SET DATA TYPE text;
  DROP TYPE "payload"."enum_tenant_user_role";
  CREATE TYPE "payload"."enum_tenant_user_role" AS ENUM('user', 'admin');
  ALTER TABLE "payload"."users_tenants" ALTER COLUMN "role" SET DATA TYPE "payload"."enum_tenant_user_role" USING "role"::"payload"."enum_tenant_user_role";`);
}
