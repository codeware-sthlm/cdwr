import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- The retired media block's tables, emptied by the migration that retired it
   ALTER TABLE "payload"."pages_blocks_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."reusable_content_blocks_media" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_media" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_media" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_media" CASCADE;
  ALTER TABLE "payload"."tenants" ADD COLUMN "deployment" varchar;
  CREATE UNIQUE INDEX "tenants_deployment_idx" ON "payload"."tenants" USING btree ("deployment");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."pages_blocks_media" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_media" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_media" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer NOT NULL,
  	"block_name" varchar
  );
  
  DROP INDEX "payload"."tenants_deployment_idx";
  ALTER TABLE "payload"."pages_blocks_media" ADD CONSTRAINT "pages_blocks_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_media" ADD CONSTRAINT "pages_blocks_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_media" ADD CONSTRAINT "_pages_v_blocks_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_media" ADD CONSTRAINT "_pages_v_blocks_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_media" ADD CONSTRAINT "reusable_content_blocks_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_media" ADD CONSTRAINT "reusable_content_blocks_media_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_media_order_idx" ON "payload"."pages_blocks_media" USING btree ("_order");
  CREATE INDEX "pages_blocks_media_parent_id_idx" ON "payload"."pages_blocks_media" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_media_path_idx" ON "payload"."pages_blocks_media" USING btree ("_path");
  CREATE INDEX "pages_blocks_media_media_idx" ON "payload"."pages_blocks_media" USING btree ("media_id");
  CREATE INDEX "_pages_v_blocks_media_order_idx" ON "payload"."_pages_v_blocks_media" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_media_parent_id_idx" ON "payload"."_pages_v_blocks_media" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_media_path_idx" ON "payload"."_pages_v_blocks_media" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_media_media_idx" ON "payload"."_pages_v_blocks_media" USING btree ("media_id");
  CREATE INDEX "reusable_content_blocks_media_order_idx" ON "payload"."reusable_content_blocks_media" USING btree ("_order");
  CREATE INDEX "reusable_content_blocks_media_parent_id_idx" ON "payload"."reusable_content_blocks_media" USING btree ("_parent_id");
  CREATE INDEX "reusable_content_blocks_media_path_idx" ON "payload"."reusable_content_blocks_media" USING btree ("_path");
  CREATE INDEX "reusable_content_blocks_media_media_idx" ON "payload"."reusable_content_blocks_media" USING btree ("media_id");
  ALTER TABLE "payload"."tenants" DROP COLUMN "deployment";`);
}
