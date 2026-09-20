import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Written to be re-runnable on a single connection, which `nx verify cms`
  // relies on when it re-applies the last migration.
  //
  // Existing rows default to 'public': nothing was restricted before this
  // field existed, and the read filter treats a null the same way.
  await db.execute(sql`
   DO $$ BEGIN
   CREATE TYPE "payload"."enum_content_visibility" AS ENUM('public', 'members');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "payload"."pages" ADD COLUMN IF NOT EXISTS "visibility" "payload"."enum_content_visibility" DEFAULT 'public' NOT NULL;
  ALTER TABLE "payload"."posts" ADD COLUMN IF NOT EXISTS "visibility" "payload"."enum_content_visibility" DEFAULT 'public' NOT NULL;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN IF NOT EXISTS "version_visibility" "payload"."enum_content_visibility" DEFAULT 'public';
  ALTER TABLE "payload"."_posts_v" ADD COLUMN IF NOT EXISTS "version_visibility" "payload"."enum_content_visibility" DEFAULT 'public';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "visibility";
  ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "visibility";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN IF EXISTS "version_visibility";
  ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_visibility";
  DROP TYPE IF EXISTS "payload"."enum_content_visibility";`);
}
