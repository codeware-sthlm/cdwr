import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_block_gallery_mode" AS ENUM('index', 'browser');
  CREATE TYPE "payload"."enum__pages_v_blocks_block_gallery_mode" AS ENUM('index', 'browser');
  CREATE TABLE "payload"."pages_blocks_block_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"mode" "payload"."enum_pages_blocks_block_gallery_mode" DEFAULT 'index',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_block_gallery_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_block_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"mode" "payload"."enum__pages_v_blocks_block_gallery_mode" DEFAULT 'index',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_block_gallery_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_block_gallery" ADD CONSTRAINT "pages_blocks_block_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_block_gallery_locales" ADD CONSTRAINT "pages_blocks_block_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_block_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_block_gallery" ADD CONSTRAINT "_pages_v_blocks_block_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_block_gallery_locales" ADD CONSTRAINT "_pages_v_blocks_block_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_block_gallery"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_block_gallery_order_idx" ON "payload"."pages_blocks_block_gallery" USING btree ("_order");
  CREATE INDEX "pages_blocks_block_gallery_parent_id_idx" ON "payload"."pages_blocks_block_gallery" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_block_gallery_path_idx" ON "payload"."pages_blocks_block_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_block_gallery_locales_locale_parent_id_unique" ON "payload"."pages_blocks_block_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_block_gallery_order_idx" ON "payload"."_pages_v_blocks_block_gallery" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_block_gallery_parent_id_idx" ON "payload"."_pages_v_blocks_block_gallery" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_block_gallery_path_idx" ON "payload"."_pages_v_blocks_block_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_block_gallery_locales_locale_parent_id_uniqu" ON "payload"."_pages_v_blocks_block_gallery_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_block_gallery" CASCADE;
  DROP TABLE "payload"."pages_blocks_block_gallery_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_block_gallery" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_block_gallery_locales" CASCADE;
  DROP TYPE "payload"."enum_pages_blocks_block_gallery_mode";
  DROP TYPE "payload"."enum__pages_v_blocks_block_gallery_mode";`);
}
