import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_custom_component_prop_type" AS ENUM('text', 'textarea', 'number', 'checkbox');
  CREATE TYPE "payload"."enum_custom_component_build_status" AS ENUM('pending', 'building', 'ready', 'failed');
  CREATE TABLE "payload"."custom_components_props_schema" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar,
  	"type" "payload"."enum_custom_component_prop_type" DEFAULT 'text' NOT NULL,
  	"required" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."custom_components" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"source" varchar NOT NULL,
  	"build_status" "payload"."enum_custom_component_build_status" DEFAULT 'pending' NOT NULL,
  	"build_diagnostics" jsonb,
  	"build_js" varchar,
  	"build_css" varchar,
  	"build_hash" varchar,
  	"build_built_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."pages_blocks_custom_component" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"component_id" integer,
  	"props" jsonb,
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."_pages_v_blocks_custom_component" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"component_id" integer,
  	"props" jsonb,
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "payload"."reusable_content_blocks_custom_component" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"component_id" integer NOT NULL,
  	"props" jsonb,
  	"band" "payload"."enum_section_band" DEFAULT 'none',
  	"block_name" varchar
  );
  
  ALTER TABLE "payload"."users_tenants" ADD COLUMN "component_developer" boolean DEFAULT false;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "custom_components_id" integer;
  ALTER TABLE "payload"."custom_components_props_schema" ADD CONSTRAINT "custom_components_props_schema_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."custom_components"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."custom_components" ADD CONSTRAINT "custom_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_custom_component" ADD CONSTRAINT "pages_blocks_custom_component_component_id_custom_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "payload"."custom_components"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."pages_blocks_custom_component" ADD CONSTRAINT "pages_blocks_custom_component_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_custom_component" ADD CONSTRAINT "_pages_v_blocks_custom_component_component_id_custom_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "payload"."custom_components"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_custom_component" ADD CONSTRAINT "_pages_v_blocks_custom_component_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_custom_component" ADD CONSTRAINT "reusable_content_blocks_custom_component_component_id_custom_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "payload"."custom_components"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."reusable_content_blocks_custom_component" ADD CONSTRAINT "reusable_content_blocks_custom_component_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."reusable_content"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "custom_components_props_schema_order_idx" ON "payload"."custom_components_props_schema" USING btree ("_order");
  CREATE INDEX "custom_components_props_schema_parent_id_idx" ON "payload"."custom_components_props_schema" USING btree ("_parent_id");
  CREATE INDEX "custom_components_tenant_idx" ON "payload"."custom_components" USING btree ("tenant_id");
  CREATE INDEX "custom_components_slug_idx" ON "payload"."custom_components" USING btree ("slug");
  CREATE INDEX "custom_components_build_build_hash_idx" ON "payload"."custom_components" USING btree ("build_hash");
  CREATE INDEX "custom_components_updated_at_idx" ON "payload"."custom_components" USING btree ("updated_at");
  CREATE INDEX "custom_components_created_at_idx" ON "payload"."custom_components" USING btree ("created_at");
  CREATE INDEX "pages_blocks_custom_component_order_idx" ON "payload"."pages_blocks_custom_component" USING btree ("_order");
  CREATE INDEX "pages_blocks_custom_component_parent_id_idx" ON "payload"."pages_blocks_custom_component" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_custom_component_path_idx" ON "payload"."pages_blocks_custom_component" USING btree ("_path");
  CREATE INDEX "pages_blocks_custom_component_component_idx" ON "payload"."pages_blocks_custom_component" USING btree ("component_id");
  CREATE INDEX "_pages_v_blocks_custom_component_order_idx" ON "payload"."_pages_v_blocks_custom_component" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_custom_component_parent_id_idx" ON "payload"."_pages_v_blocks_custom_component" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_custom_component_path_idx" ON "payload"."_pages_v_blocks_custom_component" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_custom_component_component_idx" ON "payload"."_pages_v_blocks_custom_component" USING btree ("component_id");
  CREATE INDEX "reusable_content_blocks_custom_component_order_idx" ON "payload"."reusable_content_blocks_custom_component" USING btree ("_order");
  CREATE INDEX "reusable_content_blocks_custom_component_parent_id_idx" ON "payload"."reusable_content_blocks_custom_component" USING btree ("_parent_id");
  CREATE INDEX "reusable_content_blocks_custom_component_path_idx" ON "payload"."reusable_content_blocks_custom_component" USING btree ("_path");
  CREATE INDEX "reusable_content_blocks_custom_component_component_idx" ON "payload"."reusable_content_blocks_custom_component" USING btree ("component_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_custom_components_fk" FOREIGN KEY ("custom_components_id") REFERENCES "payload"."custom_components"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_custom_components_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("custom_components_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."custom_components_props_schema" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."custom_components" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."pages_blocks_custom_component" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_pages_v_blocks_custom_component" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."reusable_content_blocks_custom_component" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."custom_components_props_schema" CASCADE;
  DROP TABLE "payload"."custom_components" CASCADE;
  DROP TABLE "payload"."pages_blocks_custom_component" CASCADE;
  DROP TABLE "payload"."_pages_v_blocks_custom_component" CASCADE;
  DROP TABLE "payload"."reusable_content_blocks_custom_component" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_custom_components_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_custom_components_id_idx";
  ALTER TABLE "payload"."users_tenants" DROP COLUMN "component_developer";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "custom_components_id";
  DROP TYPE "payload"."enum_custom_component_prop_type";
  DROP TYPE "payload"."enum_custom_component_build_status";`);
}
