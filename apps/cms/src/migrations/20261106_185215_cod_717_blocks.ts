import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_form_display" AS ENUM('inline', 'overlay');
  CREATE TYPE "payload"."enum_gallery_item_size" AS ENUM('normal', 'wide', 'tall');
  CREATE TYPE "payload"."enum_gallery_layout" AS ENUM('collage', 'row');
  CREATE TYPE "payload"."enum_hero_layout" AS ENUM('standard', 'fill');
  CREATE TYPE "payload"."enum_hero_decoration" AS ENUM('none', 'horizon-lines');
  CREATE TABLE "payload"."pages_blocks_form_locales" (
  	"overlay_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"size" "payload"."enum_gallery_item_size" DEFAULT 'normal'
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"layout" "payload"."enum_gallery_layout" DEFAULT 'collage',
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_gallery_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_form_locales" (
  	"overlay_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"size" "payload"."enum_gallery_item_size" DEFAULT 'normal',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"layout" "payload"."enum_gallery_layout" DEFAULT 'collage',
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_gallery_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_form_locales" (
  	"overlay_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_gallery_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"size" "payload"."enum_gallery_item_size" DEFAULT 'normal'
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_gallery_items_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"layout" "payload"."enum_gallery_layout" DEFAULT 'collage',
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_gallery_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_callout" ADD COLUMN "show_link" boolean DEFAULT true;
  ALTER TABLE "payload"."pages_blocks_form" ADD COLUMN "display" "payload"."enum_form_display" DEFAULT 'inline';
  ALTER TABLE "payload"."pages_blocks_form" ADD COLUMN "anchor" varchar;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "layout" "payload"."enum_hero_layout" DEFAULT 'standard';
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "decoration" "payload"."enum_hero_decoration" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD COLUMN "show_link" boolean DEFAULT true;
  ALTER TABLE "payload"."_pages_v_blocks_form" ADD COLUMN "display" "payload"."enum_form_display" DEFAULT 'inline';
  ALTER TABLE "payload"."_pages_v_blocks_form" ADD COLUMN "anchor" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "layout" "payload"."enum_hero_layout" DEFAULT 'standard';
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "decoration" "payload"."enum_hero_decoration" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_form" ADD COLUMN "display" "payload"."enum_form_display" DEFAULT 'inline';
  ALTER TABLE "payload"."reusable_content_blocks_form" ADD COLUMN "anchor" varchar;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "general_brand_label" varchar;
  ALTER TABLE "payload"."pages_blocks_form_locales" ADD CONSTRAINT "pages_blocks_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_items_locales" ADD CONSTRAINT "pages_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery" ADD CONSTRAINT "pages_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_gallery_locales" ADD CONSTRAINT "pages_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_form_locales" ADD CONSTRAINT "_pages_v_blocks_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_items_locales" ADD CONSTRAINT "_pages_v_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery" ADD CONSTRAINT "_pages_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_gallery_locales" ADD CONSTRAINT "_pages_v_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_form_locales" ADD CONSTRAINT "reusable_content_blocks_form_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content_blocks_form"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_gallery_items" ADD CONSTRAINT "reusable_content_blocks_gallery_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_gallery_items" ADD CONSTRAINT "reusable_content_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_gallery_items_locales" ADD CONSTRAINT "reusable_content_blocks_gallery_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content_blocks_gallery_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_gallery" ADD CONSTRAINT "reusable_content_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_gallery_locales" ADD CONSTRAINT "reusable_content_blocks_gallery_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "pages_blocks_form_locales_locale_parent_id_unique" ON "payload"."pages_blocks_form_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_gallery_items_order_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_gallery_items_parent_id_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_gallery_items_image_idx" ON "payload"."pages_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_gallery_items_locales_locale_parent_id_unique" ON "payload"."pages_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_gallery_order_idx" ON "payload"."pages_blocks_gallery" USING btree ("_order");
  CREATE INDEX "pages_blocks_gallery_parent_id_idx" ON "payload"."pages_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_gallery_path_idx" ON "payload"."pages_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."pages_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_form_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_form_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_items_order_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_gallery_items_parent_id_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_items_image_idx" ON "payload"."_pages_v_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_gallery_items_locales_locale_parent_id_uniqu" ON "payload"."_pages_v_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_order_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_gallery_parent_id_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_gallery_path_idx" ON "payload"."_pages_v_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_gallery_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_gallery_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "reusable_content_blocks_form_locales_locale_parent_id_unique" ON "payload"."reusable_content_blocks_form_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "reusable_content_blocks_gallery_items_order_idx" ON "payload"."reusable_content_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX "reusable_content_blocks_gallery_items_parent_id_idx" ON "payload"."reusable_content_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX "reusable_content_blocks_gallery_items_image_idx" ON "payload"."reusable_content_blocks_gallery_items" USING btree ("image_id");
  CREATE UNIQUE INDEX "reusable_content_blocks_gallery_items_locales_locale_parent_" ON "payload"."reusable_content_blocks_gallery_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "reusable_content_blocks_gallery_order_idx" ON "payload"."reusable_content_blocks_gallery" USING btree ("_order");
  CREATE INDEX "reusable_content_blocks_gallery_parent_id_idx" ON "payload"."reusable_content_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "reusable_content_blocks_gallery_path_idx" ON "payload"."reusable_content_blocks_gallery" USING btree ("_path");
  CREATE UNIQUE INDEX "reusable_content_blocks_gallery_locales_locale_parent_id_uni" ON "payload"."reusable_content_blocks_gallery_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_form_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery" CASCADE;
  DROP TABLE "payload"."pages_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_form_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_gallery_locales" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_form_locales" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_gallery_items" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_gallery_items_locales" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_gallery" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_gallery_locales" CASCADE;
  ALTER TABLE "payload"."pages_blocks_callout" DROP COLUMN "show_link";
  ALTER TABLE "payload"."pages_blocks_form" DROP COLUMN "display";
  ALTER TABLE "payload"."pages_blocks_form" DROP COLUMN "anchor";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "layout";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "decoration";
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP COLUMN "show_link";
  ALTER TABLE "payload"."_pages_v_blocks_form" DROP COLUMN "display";
  ALTER TABLE "payload"."_pages_v_blocks_form" DROP COLUMN "anchor";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "layout";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "decoration";
  ALTER TABLE "payload"."reusable_content_blocks_form" DROP COLUMN "display";
  ALTER TABLE "payload"."reusable_content_blocks_form" DROP COLUMN "anchor";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "general_brand_label";
  DROP TYPE "payload"."enum_form_display";
  DROP TYPE "payload"."enum_gallery_item_size";
  DROP TYPE "payload"."enum_gallery_layout";
  DROP TYPE "payload"."enum_hero_layout";
  DROP TYPE "payload"."enum_hero_decoration";`);
}
