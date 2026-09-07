import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_site_settings_themes" ADD VALUE 'spotlight-fork' BEFORE 'codeware';
  CREATE TABLE "payload"."pages_blocks_feature_section_sub_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_section_sub_features_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"enable_link" boolean,
  	"link_type" "payload"."enum_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"media_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_feature_section_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"link_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"author_name" varchar,
  	"author_avatar_id" integer,
  	"logo_id" integer,
  	"enable_link" boolean,
  	"link_type" "payload"."enum_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_testimonial_locales" (
  	"quote" varchar,
  	"author_role" varchar,
  	"link_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_section_sub_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_section_sub_features_locales" (
  	"title" varchar,
  	"body" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"enable_link" boolean,
  	"link_type" "payload"."enum_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"media_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_feature_section_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"link_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonial" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"author_name" varchar,
  	"author_avatar_id" integer,
  	"logo_id" integer,
  	"enable_link" boolean,
  	"link_type" "payload"."enum_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_testimonial_locales" (
  	"quote" varchar,
  	"author_role" varchar,
  	"link_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_callout" ADD COLUMN "image_id" integer;
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "media_id" integer;
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD COLUMN "image_id" integer;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "media_id" integer;
  ALTER TABLE "payload"."pages_blocks_feature_section_sub_features" ADD CONSTRAINT "pages_blocks_feature_section_sub_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_section_sub_features_locales" ADD CONSTRAINT "pages_blocks_feature_section_sub_features_locales_parent__fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_section_sub_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_section" ADD CONSTRAINT "pages_blocks_feature_section_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_section" ADD CONSTRAINT "pages_blocks_feature_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_feature_section_locales" ADD CONSTRAINT "pages_blocks_feature_section_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_feature_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonial" ADD CONSTRAINT "pages_blocks_testimonial_author_avatar_id_media_id_fk" FOREIGN KEY ("author_avatar_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonial" ADD CONSTRAINT "pages_blocks_testimonial_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonial" ADD CONSTRAINT "pages_blocks_testimonial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_testimonial_locales" ADD CONSTRAINT "pages_blocks_testimonial_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_testimonial"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_sub_features" ADD CONSTRAINT "_pages_v_blocks_feature_section_sub_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_sub_features_locales" ADD CONSTRAINT "_pages_v_blocks_feature_section_sub_features_locales_pare_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_section_sub_features"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" ADD CONSTRAINT "_pages_v_blocks_feature_section_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" ADD CONSTRAINT "_pages_v_blocks_feature_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_locales" ADD CONSTRAINT "_pages_v_blocks_feature_section_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_feature_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" ADD CONSTRAINT "_pages_v_blocks_testimonial_author_avatar_id_media_id_fk" FOREIGN KEY ("author_avatar_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" ADD CONSTRAINT "_pages_v_blocks_testimonial_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" ADD CONSTRAINT "_pages_v_blocks_testimonial_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial_locales" ADD CONSTRAINT "_pages_v_blocks_testimonial_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_testimonial"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_feature_section_sub_features_order_idx" ON "payload"."pages_blocks_feature_section_sub_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_section_sub_features_parent_id_idx" ON "payload"."pages_blocks_feature_section_sub_features" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_feature_section_sub_features_locales_locale_par" ON "payload"."pages_blocks_feature_section_sub_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_feature_section_order_idx" ON "payload"."pages_blocks_feature_section" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_section_parent_id_idx" ON "payload"."pages_blocks_feature_section" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_section_path_idx" ON "payload"."pages_blocks_feature_section" USING btree ("_path");
  CREATE INDEX "pages_blocks_feature_section_media_idx" ON "payload"."pages_blocks_feature_section" USING btree ("media_id");
  CREATE UNIQUE INDEX "pages_blocks_feature_section_locales_locale_parent_id_unique" ON "payload"."pages_blocks_feature_section_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_testimonial_order_idx" ON "payload"."pages_blocks_testimonial" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonial_parent_id_idx" ON "payload"."pages_blocks_testimonial" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonial_path_idx" ON "payload"."pages_blocks_testimonial" USING btree ("_path");
  CREATE INDEX "pages_blocks_testimonial_author_author_avatar_idx" ON "payload"."pages_blocks_testimonial" USING btree ("author_avatar_id");
  CREATE INDEX "pages_blocks_testimonial_logo_idx" ON "payload"."pages_blocks_testimonial" USING btree ("logo_id");
  CREATE UNIQUE INDEX "pages_blocks_testimonial_locales_locale_parent_id_unique" ON "payload"."pages_blocks_testimonial_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_section_sub_features_order_idx" ON "payload"."_pages_v_blocks_feature_section_sub_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_section_sub_features_parent_id_idx" ON "payload"."_pages_v_blocks_feature_section_sub_features" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_feature_section_sub_features_locales_locale_" ON "payload"."_pages_v_blocks_feature_section_sub_features_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_section_order_idx" ON "payload"."_pages_v_blocks_feature_section" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_section_parent_id_idx" ON "payload"."_pages_v_blocks_feature_section" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_section_path_idx" ON "payload"."_pages_v_blocks_feature_section" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_feature_section_media_idx" ON "payload"."_pages_v_blocks_feature_section" USING btree ("media_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_feature_section_locales_locale_parent_id_uni" ON "payload"."_pages_v_blocks_feature_section_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonial_order_idx" ON "payload"."_pages_v_blocks_testimonial" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonial_parent_id_idx" ON "payload"."_pages_v_blocks_testimonial" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonial_path_idx" ON "payload"."_pages_v_blocks_testimonial" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_testimonial_author_author_avatar_idx" ON "payload"."_pages_v_blocks_testimonial" USING btree ("author_avatar_id");
  CREATE INDEX "_pages_v_blocks_testimonial_logo_idx" ON "payload"."_pages_v_blocks_testimonial" USING btree ("logo_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_testimonial_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_testimonial_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload"."pages_blocks_callout" ADD CONSTRAINT "pages_blocks_callout_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD CONSTRAINT "_pages_v_blocks_callout_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_callout_image_idx" ON "payload"."pages_blocks_callout" USING btree ("image_id");
  CREATE INDEX "pages_blocks_hero_media_idx" ON "payload"."pages_blocks_hero" USING btree ("media_id");
  CREATE INDEX "_pages_v_blocks_callout_image_idx" ON "payload"."_pages_v_blocks_callout" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_hero_media_idx" ON "payload"."_pages_v_blocks_hero" USING btree ("media_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_feature_section_sub_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_section_sub_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_feature_section_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_testimonial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_testimonial_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_sub_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_sub_features_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_feature_section_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_testimonial_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."pages_blocks_feature_section_sub_features" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_section_sub_features_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_section" CASCADE;
  DROP TABLE "payload"."pages_blocks_feature_section_locales" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonial" CASCADE;
  DROP TABLE "payload"."pages_blocks_testimonial_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_section_sub_features" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_section_sub_features_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_section" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_feature_section_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonial" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_testimonial_locales" CASCADE;
  ALTER TABLE "payload"."pages_blocks_callout" DROP CONSTRAINT "pages_blocks_callout_image_id_media_id_fk";
  
  ALTER TABLE "payload"."pages_blocks_hero" DROP CONSTRAINT "pages_blocks_hero_media_id_media_id_fk";
  
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP CONSTRAINT "_pages_v_blocks_callout_image_id_media_id_fk";
  
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP CONSTRAINT "_pages_v_blocks_hero_media_id_media_id_fk";
  
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "payload"."enum_site_settings_themes";
  CREATE TYPE "payload"."enum_site_settings_themes" AS ENUM('shadcn', 'spotlight', 'codeware');
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_site_settings_themes" USING "value"::"payload"."enum_site_settings_themes";
  DROP INDEX "payload"."pages_blocks_callout_image_idx";
  DROP INDEX "payload"."pages_blocks_hero_media_idx";
  DROP INDEX "payload"."_pages_v_blocks_callout_image_idx";
  DROP INDEX "payload"."_pages_v_blocks_hero_media_idx";
  ALTER TABLE "payload"."pages_blocks_callout" DROP COLUMN "image_id";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "media_id";
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP COLUMN "image_id";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "media_id";`);
}
