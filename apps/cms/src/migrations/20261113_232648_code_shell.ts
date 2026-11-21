import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_code_language" ADD VALUE IF NOT EXISTS 'shell';`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_code" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "payload"."pages_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::text;
  ALTER TABLE "payload"."_pages_v_blocks_code" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "payload"."_pages_v_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::text;
  ALTER TABLE "payload"."reusable_content_blocks_code" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "payload"."reusable_content_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::text;
  UPDATE "payload"."pages_blocks_code" SET "language" = 'plaintext' WHERE "language" = 'shell';
  UPDATE "payload"."_pages_v_blocks_code" SET "language" = 'plaintext' WHERE "language" = 'shell';
  UPDATE "payload"."reusable_content_blocks_code" SET "language" = 'plaintext' WHERE "language" = 'shell';
  DROP TYPE "payload"."enum_code_language";
  CREATE TYPE "payload"."enum_code_language" AS ENUM('ts', 'plaintext', 'tsx', 'js', 'jsx');
  ALTER TABLE "payload"."pages_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::"payload"."enum_code_language";
  ALTER TABLE "payload"."pages_blocks_code" ALTER COLUMN "language" SET DATA TYPE "payload"."enum_code_language" USING "language"::"payload"."enum_code_language";
  ALTER TABLE "payload"."_pages_v_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::"payload"."enum_code_language";
  ALTER TABLE "payload"."_pages_v_blocks_code" ALTER COLUMN "language" SET DATA TYPE "payload"."enum_code_language" USING "language"::"payload"."enum_code_language";
  ALTER TABLE "payload"."reusable_content_blocks_code" ALTER COLUMN "language" SET DEFAULT 'ts'::"payload"."enum_code_language";
  ALTER TABLE "payload"."reusable_content_blocks_code" ALTER COLUMN "language" SET DATA TYPE "payload"."enum_code_language" USING "language"::"payload"."enum_code_language";`);
}
