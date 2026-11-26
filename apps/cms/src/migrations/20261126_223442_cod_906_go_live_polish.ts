import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_block_gallery_card_picture" AS ENUM('illustration', 'block');
  CREATE TABLE "payload"."pages_blocks_code_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_code_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_code_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_block_gallery" ADD COLUMN "card_picture" "payload"."enum_block_gallery_card_picture" DEFAULT 'illustration';
  ALTER TABLE "payload"."pages_blocks_code" ADD COLUMN "visible_lines" numeric;
  ALTER TABLE "payload"."_pages_v_blocks_block_gallery" ADD COLUMN "card_picture" "payload"."enum_block_gallery_card_picture" DEFAULT 'illustration';
  ALTER TABLE "payload"."_pages_v_blocks_code" ADD COLUMN "visible_lines" numeric;
  ALTER TABLE "payload"."reusable_content_blocks_code" ADD COLUMN "visible_lines" numeric;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "footer_licence_url" varchar;
  ALTER TABLE "payload"."site_settings" ADD COLUMN "footer_back_to_top" boolean;
  ALTER TABLE "payload"."site_settings_locales" ADD COLUMN "footer_licence" varchar;
  ALTER TABLE "payload"."pages_blocks_code_locales" ADD CONSTRAINT "pages_blocks_code_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_code"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_code_locales" ADD CONSTRAINT "_pages_v_blocks_code_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_code"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_code_locales" ADD CONSTRAINT "reusable_content_blocks_code_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content_blocks_code"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "pages_blocks_code_locales_locale_parent_id_unique" ON "payload"."pages_blocks_code_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_code_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_code_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "reusable_content_blocks_code_locales_locale_parent_id_unique" ON "payload"."reusable_content_blocks_code_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_code_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_code_locales" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_code_locales" CASCADE;
  ALTER TABLE "payload"."pages_blocks_block_gallery" DROP COLUMN "card_picture";
  ALTER TABLE "payload"."pages_blocks_code" DROP COLUMN "visible_lines";
  ALTER TABLE "payload"."_pages_v_blocks_block_gallery" DROP COLUMN "card_picture";
  ALTER TABLE "payload"."_pages_v_blocks_code" DROP COLUMN "visible_lines";
  ALTER TABLE "payload"."reusable_content_blocks_code" DROP COLUMN "visible_lines";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "footer_licence_url";
  ALTER TABLE "payload"."site_settings" DROP COLUMN "footer_back_to_top";
  ALTER TABLE "payload"."site_settings_locales" DROP COLUMN "footer_licence";
  DROP TYPE "payload"."enum_block_gallery_card_picture";`);
}
