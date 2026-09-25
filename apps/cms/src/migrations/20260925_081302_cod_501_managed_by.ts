import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."categories" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."media" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_managed_by" varchar;
  ALTER TABLE "payload"."posts" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_managed_by" varchar;
  ALTER TABLE "payload"."tags" ADD COLUMN "managed_by" varchar;
  ALTER TABLE "payload"."forms" ADD COLUMN "managed_by" varchar;
  CREATE INDEX "categories_managed_by_idx" ON "payload"."categories" USING btree ("managed_by");
  CREATE INDEX "media_managed_by_idx" ON "payload"."media" USING btree ("managed_by");
  CREATE INDEX "pages_managed_by_idx" ON "payload"."pages" USING btree ("managed_by");
  CREATE INDEX "_pages_v_version_version_managed_by_idx" ON "payload"."_pages_v" USING btree ("version_managed_by");
  CREATE INDEX "posts_managed_by_idx" ON "payload"."posts" USING btree ("managed_by");
  CREATE INDEX "_posts_v_version_version_managed_by_idx" ON "payload"."_posts_v" USING btree ("version_managed_by");
  CREATE INDEX "tags_managed_by_idx" ON "payload"."tags" USING btree ("managed_by");
  CREATE INDEX "forms_managed_by_idx" ON "payload"."forms" USING btree ("managed_by");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."categories_managed_by_idx";
  DROP INDEX "payload"."media_managed_by_idx";
  DROP INDEX "payload"."pages_managed_by_idx";
  DROP INDEX "payload"."_pages_v_version_version_managed_by_idx";
  DROP INDEX "payload"."posts_managed_by_idx";
  DROP INDEX "payload"."_posts_v_version_version_managed_by_idx";
  DROP INDEX "payload"."tags_managed_by_idx";
  DROP INDEX "payload"."forms_managed_by_idx";
  ALTER TABLE "payload"."categories" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."media" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."pages" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_managed_by";
  ALTER TABLE "payload"."posts" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."_posts_v" DROP COLUMN "version_managed_by";
  ALTER TABLE "payload"."tags" DROP COLUMN "managed_by";
  ALTER TABLE "payload"."forms" DROP COLUMN "managed_by";`);
}
