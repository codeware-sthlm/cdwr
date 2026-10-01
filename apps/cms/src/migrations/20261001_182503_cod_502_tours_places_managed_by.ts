import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."places" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."tours" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."_tours_v" ADD COLUMN "version_managed_by" varchar;
  CREATE INDEX "places_managed_by_idx" ON "payload"."places" USING btree ("managed_by");
  CREATE INDEX "tours_managed_by_idx" ON "payload"."tours" USING btree ("managed_by");
  CREATE INDEX "_tours_v_version_version_managed_by_idx" ON "payload"."_tours_v" USING btree ("version_managed_by");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."places_managed_by_idx";
  DROP INDEX "payload"."tours_managed_by_idx";
  DROP INDEX "payload"."_tours_v_version_version_managed_by_idx";
  ALTER TABLE "payload"."places" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."tours" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."_tours_v" DROP COLUMN "version_managed_by";`);
}
