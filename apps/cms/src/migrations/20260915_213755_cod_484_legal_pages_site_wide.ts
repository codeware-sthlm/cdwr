import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_settings" RENAME COLUMN "tour_signups_privacy_page_id" TO "legal_privacy_page_id";
  ALTER TABLE "payload"."site_settings" RENAME COLUMN "tour_signups_terms_page_id" TO "legal_terms_page_id";
  ALTER TABLE "payload"."site_settings" DROP CONSTRAINT "site_settings_tour_signups_privacy_page_id_pages_id_fk";

  ALTER TABLE "payload"."site_settings" DROP CONSTRAINT "site_settings_tour_signups_terms_page_id_pages_id_fk";

  DROP INDEX "payload"."site_settings_tour_signups_tour_signups_privacy_page_idx";
  DROP INDEX "payload"."site_settings_tour_signups_tour_signups_terms_page_idx";
  ALTER TABLE "payload"."site_settings" ADD CONSTRAINT "site_settings_legal_privacy_page_id_pages_id_fk" FOREIGN KEY ("legal_privacy_page_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_settings" ADD CONSTRAINT "site_settings_legal_terms_page_id_pages_id_fk" FOREIGN KEY ("legal_terms_page_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_legal_legal_privacy_page_idx" ON "payload"."site_settings" USING btree ("legal_privacy_page_id");
  CREATE INDEX "site_settings_legal_legal_terms_page_idx" ON "payload"."site_settings" USING btree ("legal_terms_page_id");`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_settings" RENAME COLUMN "legal_privacy_page_id" TO "tour_signups_privacy_page_id";
  ALTER TABLE "payload"."site_settings" RENAME COLUMN "legal_terms_page_id" TO "tour_signups_terms_page_id";
  ALTER TABLE "payload"."site_settings" DROP CONSTRAINT "site_settings_legal_privacy_page_id_pages_id_fk";

  ALTER TABLE "payload"."site_settings" DROP CONSTRAINT "site_settings_legal_terms_page_id_pages_id_fk";

  DROP INDEX "payload"."site_settings_legal_legal_privacy_page_idx";
  DROP INDEX "payload"."site_settings_legal_legal_terms_page_idx";
  ALTER TABLE "payload"."site_settings" ADD CONSTRAINT "site_settings_tour_signups_privacy_page_id_pages_id_fk" FOREIGN KEY ("tour_signups_privacy_page_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_settings" ADD CONSTRAINT "site_settings_tour_signups_terms_page_id_pages_id_fk" FOREIGN KEY ("tour_signups_terms_page_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_tour_signups_tour_signups_privacy_page_idx" ON "payload"."site_settings" USING btree ("tour_signups_privacy_page_id");
  CREATE INDEX "site_settings_tour_signups_tour_signups_terms_page_idx" ON "payload"."site_settings" USING btree ("tour_signups_terms_page_id");`);
}
