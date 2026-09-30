import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."reusable_content" ADD COLUMN "managed_by" varchar;
  CREATE INDEX "reusable_content_managed_by_idx" ON "payload"."reusable_content" USING btree ("managed_by");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."reusable_content_managed_by_idx";
  ALTER TABLE "payload"."reusable_content" DROP COLUMN "managed_by";`);
}
