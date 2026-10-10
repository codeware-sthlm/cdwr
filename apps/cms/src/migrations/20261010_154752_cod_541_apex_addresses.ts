import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_platform_settings_domains_certificate_addresses_type" AS ENUM('A', 'AAAA');
  CREATE TYPE "payload"."enum_tenants_domains_certificate_addresses_type" AS ENUM('A', 'AAAA');
  CREATE TABLE "payload"."platform_settings_domains_certificate_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_platform_settings_domains_certificate_addresses_type",
  	"address" varchar
  );
  
  CREATE TABLE "payload"."tenants_domains_certificate_addresses" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_tenants_domains_certificate_addresses_type",
  	"address" varchar
  );
  
  ALTER TABLE "payload"."platform_settings_domains_certificate_addresses" ADD CONSTRAINT "platform_settings_domains_certificate_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."platform_settings_domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."tenants_domains_certificate_addresses" ADD CONSTRAINT "tenants_domains_certificate_addresses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."tenants_domains"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "platform_settings_domains_certificate_addresses_order_idx" ON "payload"."platform_settings_domains_certificate_addresses" USING btree ("_order");
  CREATE INDEX "platform_settings_domains_certificate_addresses_parent_id_idx" ON "payload"."platform_settings_domains_certificate_addresses" USING btree ("_parent_id");
  CREATE INDEX "tenants_domains_certificate_addresses_order_idx" ON "payload"."tenants_domains_certificate_addresses" USING btree ("_order");
  CREATE INDEX "tenants_domains_certificate_addresses_parent_id_idx" ON "payload"."tenants_domains_certificate_addresses" USING btree ("_parent_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."platform_settings_domains_certificate_addresses" CASCADE;
  DROP TABLE "payload"."tenants_domains_certificate_addresses" CASCADE;
  DROP TYPE "payload"."enum_platform_settings_domains_certificate_addresses_type";
  DROP TYPE "payload"."enum_tenants_domains_certificate_addresses_type";`);
}
