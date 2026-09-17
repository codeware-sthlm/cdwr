import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Give submissions saved before multi-tenancy the tenant of their form.
 *
 * The retention sweep deletes per workspace, so a submission without a tenant
 * would sit there for good once a workspace sets a retention period.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "payload"."form_submissions" AS fs
  SET "tenant_id" = f."tenant_id"
  FROM "payload"."forms" AS f
  WHERE fs."form_id" = f."id"
    AND fs."tenant_id" IS NULL
    AND f."tenant_id" IS NOT NULL;`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Which rows were empty is not recorded, so there is nothing to put back
}
