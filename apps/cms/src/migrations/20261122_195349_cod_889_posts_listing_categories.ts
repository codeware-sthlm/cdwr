import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload"."_pages_v_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload"."pages_rels" ADD CONSTRAINT "pages_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "payload"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_rels_categories_id_idx" ON "payload"."pages_rels" USING btree ("categories_id");
  CREATE INDEX "_pages_v_rels_categories_id_idx" ON "payload"."_pages_v_rels" USING btree ("categories_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_rels" DROP CONSTRAINT "pages_rels_categories_fk";
  
  ALTER TABLE "payload"."_pages_v_rels" DROP CONSTRAINT "_pages_v_rels_categories_fk";
  
  DROP INDEX "payload"."pages_rels_categories_id_idx";
  DROP INDEX "payload"."_pages_v_rels_categories_id_idx";
  ALTER TABLE "payload"."pages_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload"."_pages_v_rels" DROP COLUMN "categories_id";`);
}
