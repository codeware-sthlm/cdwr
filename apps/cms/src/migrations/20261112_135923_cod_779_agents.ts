import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."agents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "payload"."posts" ADD COLUMN "drafted_by_id" integer;
  ALTER TABLE "payload"."posts" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_drafted_by_id" integer;
  ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "agents_id" integer;
  ALTER TABLE "payload"."payload_preferences_rels" ADD COLUMN "agents_id" integer;
  ALTER TABLE "payload"."agents" ADD CONSTRAINT "agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "agents_tenant_idx" ON "payload"."agents" USING btree ("tenant_id");
  CREATE INDEX "agents_updated_at_idx" ON "payload"."agents" USING btree ("updated_at");
  CREATE INDEX "agents_created_at_idx" ON "payload"."agents" USING btree ("created_at");
  ALTER TABLE "payload"."posts" ADD CONSTRAINT "posts_drafted_by_id_agents_id_fk" FOREIGN KEY ("drafted_by_id") REFERENCES "payload"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_posts_v" ADD CONSTRAINT "_posts_v_version_drafted_by_id_agents_id_fk" FOREIGN KEY ("version_drafted_by_id") REFERENCES "payload"."agents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agents_fk" FOREIGN KEY ("agents_id") REFERENCES "payload"."agents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_agents_fk" FOREIGN KEY ("agents_id") REFERENCES "payload"."agents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_drafted_by_idx" ON "payload"."posts" USING btree ("drafted_by_id");
  CREATE INDEX "posts_deleted_at_idx" ON "payload"."posts" USING btree ("deleted_at");
  CREATE INDEX "_posts_v_version_version_drafted_by_idx" ON "payload"."_posts_v" USING btree ("version_drafted_by_id");
  CREATE INDEX "_posts_v_version_version_deleted_at_idx" ON "payload"."_posts_v" USING btree ("version_deleted_at");
  CREATE INDEX "payload_locked_documents_rels_agents_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("agents_id");
  CREATE INDEX "payload_preferences_rels_agents_id_idx" ON "payload"."payload_preferences_rels" USING btree ("agents_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."agents" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."agents" CASCADE;
  -- The CASCADE above already dropped these foreign keys
  ALTER TABLE "payload"."posts" DROP CONSTRAINT IF EXISTS "posts_drafted_by_id_agents_id_fk";

  ALTER TABLE "payload"."_posts_v" DROP CONSTRAINT IF EXISTS "_posts_v_version_drafted_by_id_agents_id_fk";

  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_agents_fk";

  ALTER TABLE "payload"."payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_agents_fk";
  
  DROP INDEX "payload"."posts_drafted_by_idx";
  DROP INDEX "payload"."posts_deleted_at_idx";
  DROP INDEX "payload"."_posts_v_version_version_drafted_by_idx";
  DROP INDEX "payload"."_posts_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_agents_id_idx";
  DROP INDEX "payload"."payload_preferences_rels_agents_id_idx";
  ALTER TABLE "payload"."posts" DROP COLUMN "drafted_by_id";
  ALTER TABLE "payload"."posts" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_posts_v" DROP COLUMN "version_drafted_by_id";
  ALTER TABLE "payload"."_posts_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "agents_id";
  ALTER TABLE "payload"."payload_preferences_rels" DROP COLUMN "agents_id";`);
}
