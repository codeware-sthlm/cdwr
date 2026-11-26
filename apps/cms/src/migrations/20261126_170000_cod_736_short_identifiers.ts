import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Renames the tables whose identifiers went past Postgres's 63 characters,
 * with their primary keys, indexes and foreign keys, so the rows stay put.
 * The tenants certificates table was within the limit, but shares the
 * domains field's naming rule with platform settings.
 *
 * Written by hand: the generator offers drop-and-create for a new table name.
 * The old names are spelled as Postgres stored them, cut to 63 characters.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // contract: the release before reads the old table names, so this deploys
  // with every cms app in maintenance and away from the nightly jobs
  // (DEVELOPMENT.md, deploying a contract migration)
  await db.execute(sql`
   ALTER TABLE "payload"."platform_settings_domains_certificate_issued_certificates" RENAME TO "platform_settings_domains_certificate_certs";
  ALTER INDEX "payload"."platform_settings_domains_certificate_issued_certificates_pkey" RENAME TO "platform_settings_domains_certificate_certs_pkey";
  ALTER INDEX "payload"."platform_settings_domains_certificate_issued_certificates_order" RENAME TO "platform_settings_domains_certificate_certs_order_idx";
  ALTER INDEX "payload"."platform_settings_domains_certificate_issued_certificates_paren" RENAME TO "platform_settings_domains_certificate_certs_parent_id_idx";
  ALTER TABLE "payload"."platform_settings_domains_certificate_certs" RENAME CONSTRAINT "platform_settings_domains_certificate_issued_certificates_paren" TO "platform_settings_domains_certificate_certs_parent_id_fk";

  ALTER TABLE "payload"."tenants_domains_certificate_issued_certificates" RENAME TO "tenants_domains_certificate_certs";
  ALTER INDEX "payload"."tenants_domains_certificate_issued_certificates_pkey" RENAME TO "tenants_domains_certificate_certs_pkey";
  ALTER INDEX "payload"."tenants_domains_certificate_issued_certificates_order_idx" RENAME TO "tenants_domains_certificate_certs_order_idx";
  ALTER INDEX "payload"."tenants_domains_certificate_issued_certificates_parent_id_idx" RENAME TO "tenants_domains_certificate_certs_parent_id_idx";
  ALTER TABLE "payload"."tenants_domains_certificate_certs" RENAME CONSTRAINT "tenants_domains_certificate_issued_certificates_parent_id_fk" TO "tenants_domains_certificate_certs_parent_id_fk";

  ALTER TABLE "payload"."site_settings_tour_signups_notification_recipients" RENAME TO "site_settings_tour_signups_recipients";
  ALTER INDEX "payload"."site_settings_tour_signups_notification_recipients_pkey" RENAME TO "site_settings_tour_signups_recipients_pkey";
  ALTER INDEX "payload"."site_settings_tour_signups_notification_recipients_order_idx" RENAME TO "site_settings_tour_signups_recipients_order_idx";
  ALTER INDEX "payload"."site_settings_tour_signups_notification_recipients_parent_id_id" RENAME TO "site_settings_tour_signups_recipients_parent_id_idx";
  ALTER TABLE "payload"."site_settings_tour_signups_recipients" RENAME CONSTRAINT "site_settings_tour_signups_notification_recipients_parent_id_fk" TO "site_settings_tour_signups_recipients_parent_id_fk";`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."platform_settings_domains_certificate_certs" RENAME CONSTRAINT "platform_settings_domains_certificate_certs_parent_id_fk" TO "platform_settings_domains_certificate_issued_certificates_paren";
  ALTER INDEX "payload"."platform_settings_domains_certificate_certs_parent_id_idx" RENAME TO "platform_settings_domains_certificate_issued_certificates_paren";
  ALTER INDEX "payload"."platform_settings_domains_certificate_certs_order_idx" RENAME TO "platform_settings_domains_certificate_issued_certificates_order";
  ALTER INDEX "payload"."platform_settings_domains_certificate_certs_pkey" RENAME TO "platform_settings_domains_certificate_issued_certificates_pkey";
  ALTER TABLE "payload"."platform_settings_domains_certificate_certs" RENAME TO "platform_settings_domains_certificate_issued_certificates";

  ALTER TABLE "payload"."tenants_domains_certificate_certs" RENAME CONSTRAINT "tenants_domains_certificate_certs_parent_id_fk" TO "tenants_domains_certificate_issued_certificates_parent_id_fk";
  ALTER INDEX "payload"."tenants_domains_certificate_certs_parent_id_idx" RENAME TO "tenants_domains_certificate_issued_certificates_parent_id_idx";
  ALTER INDEX "payload"."tenants_domains_certificate_certs_order_idx" RENAME TO "tenants_domains_certificate_issued_certificates_order_idx";
  ALTER INDEX "payload"."tenants_domains_certificate_certs_pkey" RENAME TO "tenants_domains_certificate_issued_certificates_pkey";
  ALTER TABLE "payload"."tenants_domains_certificate_certs" RENAME TO "tenants_domains_certificate_issued_certificates";

  ALTER TABLE "payload"."site_settings_tour_signups_recipients" RENAME CONSTRAINT "site_settings_tour_signups_recipients_parent_id_fk" TO "site_settings_tour_signups_notification_recipients_parent_id_fk";
  ALTER INDEX "payload"."site_settings_tour_signups_recipients_parent_id_idx" RENAME TO "site_settings_tour_signups_notification_recipients_parent_id_id";
  ALTER INDEX "payload"."site_settings_tour_signups_recipients_order_idx" RENAME TO "site_settings_tour_signups_notification_recipients_order_idx";
  ALTER INDEX "payload"."site_settings_tour_signups_recipients_pkey" RENAME TO "site_settings_tour_signups_notification_recipients_pkey";
  ALTER TABLE "payload"."site_settings_tour_signups_recipients" RENAME TO "site_settings_tour_signups_notification_recipients";`);
}
