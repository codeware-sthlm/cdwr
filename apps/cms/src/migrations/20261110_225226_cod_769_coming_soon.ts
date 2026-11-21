import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."pages_blocks_coming_soon" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"opening_date" timestamp(3) with time zone,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"notify_anchor" varchar,
  	"show_illustration" boolean DEFAULT true,
  	"illustration" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."pages_blocks_coming_soon_locales" (
  	"badge" varchar,
  	"heading" varchar,
  	"message" varchar,
  	"notify_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_coming_soon" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"opening_date" timestamp(3) with time zone,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"notify_anchor" varchar,
  	"show_illustration" boolean DEFAULT true,
  	"illustration" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_coming_soon_locales" (
  	"badge" varchar,
  	"heading" varchar,
  	"message" varchar,
  	"notify_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "payload"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload"."pages_blocks_coming_soon" ADD CONSTRAINT "pages_blocks_coming_soon_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_coming_soon_locales" ADD CONSTRAINT "pages_blocks_coming_soon_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages_blocks_coming_soon"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_coming_soon" ADD CONSTRAINT "_pages_v_blocks_coming_soon_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_coming_soon_locales" ADD CONSTRAINT "_pages_v_blocks_coming_soon_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v_blocks_coming_soon"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_coming_soon_order_idx" ON "payload"."pages_blocks_coming_soon" USING btree ("_order");
  CREATE INDEX "pages_blocks_coming_soon_parent_id_idx" ON "payload"."pages_blocks_coming_soon" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_coming_soon_path_idx" ON "payload"."pages_blocks_coming_soon" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_coming_soon_locales_locale_parent_id_unique" ON "payload"."pages_blocks_coming_soon_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_coming_soon_order_idx" ON "payload"."_pages_v_blocks_coming_soon" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_coming_soon_parent_id_idx" ON "payload"."_pages_v_blocks_coming_soon" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_coming_soon_path_idx" ON "payload"."_pages_v_blocks_coming_soon" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_coming_soon_locales_locale_parent_id_unique" ON "payload"."_pages_v_blocks_coming_soon_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."pages_blocks_coming_soon" CASCADE;
  DROP TABLE "payload"."pages_blocks_coming_soon_locales" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_coming_soon" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_coming_soon_locales" CASCADE;`);
}
