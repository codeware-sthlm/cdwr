import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."invite_codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lookup" varchar,
  	"code_hash" varchar NOT NULL,
  	"max_uses" numeric DEFAULT 1 NOT NULL,
  	"uses" numeric DEFAULT 0,
  	"expires_at" timestamp(3) with time zone,
  	"note" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."platform_settings" ADD COLUMN "signup_open" boolean DEFAULT false;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "invite_codes_id" integer;
  CREATE UNIQUE INDEX "invite_codes_lookup_idx" ON "payload"."invite_codes" USING btree ("lookup");
  CREATE INDEX "invite_codes_updated_at_idx" ON "payload"."invite_codes" USING btree ("updated_at");
  CREATE INDEX "invite_codes_created_at_idx" ON "payload"."invite_codes" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invite_codes_fk" FOREIGN KEY ("invite_codes_id") REFERENCES "payload"."invite_codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_invite_codes_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("invite_codes_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."invite_codes" DISABLE ROW LEVEL SECURITY;

  -- Detach the locked documents relation before dropping the table,
  -- since "DROP TABLE ... CASCADE" would remove the foreign key itself
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_invite_codes_fk";
  DROP INDEX "payload"."payload_locked_documents_rels_invite_codes_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "invite_codes_id";

  DROP TABLE "payload"."invite_codes" CASCADE;
  ALTER TABLE "payload"."platform_settings" DROP COLUMN "signup_open";`);
}
