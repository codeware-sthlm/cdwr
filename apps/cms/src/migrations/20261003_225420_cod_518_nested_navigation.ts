import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_navigation_items_type" AS ENUM('link', 'group');
  CREATE TABLE "payload"."navigation_items_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label_source" "payload"."enum_navigation_label_source" DEFAULT 'document',
  	"custom_label" varchar
  );
  
  ALTER TABLE "payload"."navigation_items" ADD COLUMN "type" "payload"."enum_navigation_items_type" DEFAULT 'link';
  ALTER TABLE "payload"."navigation_items" ADD COLUMN "label" varchar;
  ALTER TABLE "payload"."navigation_items_children" ADD CONSTRAINT "navigation_items_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."navigation_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "navigation_items_children_order_idx" ON "payload"."navigation_items_children" USING btree ("_order");
  CREATE INDEX "navigation_items_children_parent_id_idx" ON "payload"."navigation_items_children" USING btree ("_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."navigation_items_children" CASCADE;
  ALTER TABLE "payload"."navigation_items" DROP COLUMN "type";
  ALTER TABLE "payload"."navigation_items" DROP COLUMN "label";
  DROP TYPE "payload"."enum_navigation_items_type";`);
}
