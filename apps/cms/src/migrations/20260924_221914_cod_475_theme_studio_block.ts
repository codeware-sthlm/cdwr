import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * The `theme-studio` block's tables, and nothing else.
 *
 * Generated against the 2026-09-15 snapshot, since the two COD-451 migrations
 * were written by hand without one, so the diff also replayed their DDL. That
 * is stripped here — it is already committed — and this migration's snapshot
 * is the complete schema again, so the next diff starts from the right place.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pages_blocks_theme_studio_start_from" AS ENUM('shadcn', 'spotlight', 'spotlight-fork', 'codeware');
  CREATE TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from" AS ENUM('shadcn', 'spotlight', 'spotlight-fork', 'codeware');
  CREATE TABLE "payload"."pages_blocks_theme_studio" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start_from" "payload"."enum_pages_blocks_theme_studio_start_from" DEFAULT 'spotlight',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_theme_studio_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"note" varchar DEFAULT 'Live — the studio itself, not a screenshot of it. Nothing you do here leaves your browser.',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_theme_studio" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"start_from" "payload"."enum__pages_v_blocks_theme_studio_start_from" DEFAULT 'spotlight',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_theme_studio_locales" (
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"note" varchar DEFAULT 'Live — the studio itself, not a screenshot of it. Nothing you do here leaves your browser.',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_theme_studio" ADD CONSTRAINT "pages_blocks_theme_studio_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_theme_studio_locales" ADD CONSTRAINT "pages_blocks_theme_studio_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_theme_studio"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ADD CONSTRAINT "_pages_v_blocks_theme_studio_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio_locales" ADD CONSTRAINT "_pages_v_blocks_theme_studio_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_theme_studio"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_theme_studio_order_idx" ON "payload"."pages_blocks_theme_studio" USING btree ("_order");
  CREATE INDEX "pages_blocks_theme_studio_parent_id_idx" ON "payload"."pages_blocks_theme_studio" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_theme_studio_path_idx" ON "payload"."pages_blocks_theme_studio" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_theme_studio_locales_locale_parent_id_unique" ON "payload"."pages_blocks_theme_studio_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_theme_studio_order_idx" ON "payload"."_pages_v_blocks_theme_studio" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_theme_studio_parent_id_idx" ON "payload"."_pages_v_blocks_theme_studio" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_theme_studio_path_idx" ON "payload"."_pages_v_blocks_theme_studio" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_theme_studio_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_theme_studio_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_theme_studio" CASCADE;
  DROP TABLE "payload"."pages_blocks_theme_studio_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_theme_studio" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_theme_studio_locales" CASCADE;
  DROP TYPE "payload"."enum_pages_blocks_theme_studio_start_from";
  DROP TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from";`);
}
