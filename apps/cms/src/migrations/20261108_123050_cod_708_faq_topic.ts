import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Existing rows need a topic before NOT NULL holds: they take 'search-help'
  // until the FAQ apply at host boot sets the real topic of every entry in
  // faq.ts. The default is dropped again, so the schema matches the snapshot.
  await db.execute(sql`
   CREATE TYPE "payload"."enum_faq_topic" AS ENUM('pages', 'drafts', 'navigation', 'site-settings', 'search-help', 'account', 'statistics', 'media', 'forms');
  ALTER TABLE "payload"."faq" ADD COLUMN "topic" "payload"."enum_faq_topic" NOT NULL DEFAULT 'search-help';
  ALTER TABLE "payload"."faq" ALTER COLUMN "topic" DROP DEFAULT;`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."faq" DROP COLUMN "topic";
  DROP TYPE "payload"."enum_faq_topic";`);
}
