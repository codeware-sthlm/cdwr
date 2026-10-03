import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."custom_components" ADD COLUMN "managed_by" varchar;
  CREATE INDEX "custom_components_managed_by_idx" ON "payload"."custom_components" USING btree ("managed_by");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."custom_components_managed_by_idx";
  ALTER TABLE "payload"."custom_components" DROP COLUMN "managed_by";`);
}
