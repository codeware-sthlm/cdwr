import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Every built component is built again: a stylesheet built before this is
 * not scoped to its element and leaks into the page it is placed on. Pending
 * is what the recovery pass picks up at boot; the served bundle stays until
 * the new one replaces it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "payload"."custom_components" SET "build_status" = 'pending' WHERE "build_status" = 'ready';`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // A rebuilt component is a better one; there is nothing to restore
}
