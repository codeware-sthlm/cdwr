import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- A custom theme may hold a name that is now a built-in one. It becomes <slug>-own, or <slug>-own-<id> where the tenant already has that, and a site default naming it follows
  WITH "renamed" AS (SELECT "c"."id", "c"."tenant_id", "c"."slug" AS "old", "c"."slug" || '-own' || CASE WHEN EXISTS (SELECT 1 FROM "payload"."custom_themes" AS "o" WHERE "o"."tenant_id" = "c"."tenant_id" AND "o"."slug" = "c"."slug" || '-own') THEN '-' || "c"."id" ELSE '' END AS "new" FROM "payload"."custom_themes" AS "c" WHERE "c"."slug" IN ('frost', 'archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement')) UPDATE "payload"."site_settings" AS "s" SET "general_default_theme" = "r"."new" FROM "renamed" AS "r" WHERE "r"."tenant_id" = "s"."tenant_id" AND "r"."old" = "s"."general_default_theme";
  WITH "renamed" AS (SELECT "c"."id", "c"."tenant_id", "c"."slug" AS "old", "c"."slug" || '-own' || CASE WHEN EXISTS (SELECT 1 FROM "payload"."custom_themes" AS "o" WHERE "o"."tenant_id" = "c"."tenant_id" AND "o"."slug" = "c"."slug" || '-own') THEN '-' || "c"."id" ELSE '' END AS "new" FROM "payload"."custom_themes" AS "c" WHERE "c"."slug" IN ('frost', 'archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement')) UPDATE "payload"."custom_themes" AS "c" SET "slug" = "r"."new" FROM "renamed" AS "r" WHERE "r"."id" = "c"."id";
   ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE text;
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::text;
  UPDATE "payload"."pages_blocks_theme_studio" SET "start_from" = CASE "start_from" WHEN 'shadcn' THEN 'frost' WHEN 'spotlight-fork' THEN 'spotlight' ELSE "start_from" END;
  DROP TYPE "payload"."enum_pages_blocks_theme_studio_start_from";
  CREATE TYPE "payload"."enum_pages_blocks_theme_studio_start_from" AS ENUM('frost', 'spotlight', 'codeware', 'archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement');
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::"payload"."enum_pages_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE "payload"."enum_pages_blocks_theme_studio_start_from" USING "start_from"::"payload"."enum_pages_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE text;
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::text;
  UPDATE "payload"."_pages_v_blocks_theme_studio" SET "start_from" = CASE "start_from" WHEN 'shadcn' THEN 'frost' WHEN 'spotlight-fork' THEN 'spotlight' ELSE "start_from" END;
  DROP TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from";
  CREATE TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from" AS ENUM('frost', 'spotlight', 'codeware', 'archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement');
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::"payload"."enum__pages_v_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from" USING "start_from"::"payload"."enum__pages_v_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE text;
  DELETE FROM "payload"."site_settings_general_themes" AS "fork" WHERE "fork"."value" = 'spotlight-fork' AND EXISTS (SELECT 1 FROM "payload"."site_settings_general_themes" AS "kept" WHERE "kept"."parent_id" = "fork"."parent_id" AND "kept"."value" = 'spotlight');
  UPDATE "payload"."site_settings_general_themes" SET "value" = CASE "value" WHEN 'shadcn' THEN 'frost' WHEN 'spotlight-fork' THEN 'spotlight' ELSE "value" END;
  UPDATE "payload"."site_settings" SET "general_default_theme" = CASE "general_default_theme" WHEN 'shadcn' THEN 'frost' WHEN 'spotlight-fork' THEN 'spotlight' ELSE "general_default_theme" END;
  DROP TYPE "payload"."enum_site_settings_themes";
  CREATE TYPE "payload"."enum_site_settings_themes" AS ENUM('frost', 'spotlight', 'codeware', 'archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement');
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_site_settings_themes" USING "value"::"payload"."enum_site_settings_themes";`);
}

/**
 * Restores the old theme names; the `-own` renames stay.
 *
 * Undoing one would need to know it was made here, and a tenant may since have
 * named a theme `frost-own` itself. A renamed theme keeps working under its new
 * slug, so leaving it is the safe direction.
 */
export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE text;
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::text;
  UPDATE "payload"."pages_blocks_theme_studio" SET "start_from" = CASE WHEN "start_from" = 'frost' THEN 'shadcn' WHEN "start_from" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') THEN 'spotlight' ELSE "start_from" END;
  DROP TYPE "payload"."enum_pages_blocks_theme_studio_start_from";
  CREATE TYPE "payload"."enum_pages_blocks_theme_studio_start_from" AS ENUM('shadcn', 'spotlight', 'spotlight-fork', 'codeware');
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::"payload"."enum_pages_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."pages_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE "payload"."enum_pages_blocks_theme_studio_start_from" USING "start_from"::"payload"."enum_pages_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE text;
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::text;
  UPDATE "payload"."_pages_v_blocks_theme_studio" SET "start_from" = CASE WHEN "start_from" = 'frost' THEN 'shadcn' WHEN "start_from" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') THEN 'spotlight' ELSE "start_from" END;
  DROP TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from";
  CREATE TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from" AS ENUM('shadcn', 'spotlight', 'spotlight-fork', 'codeware');
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DEFAULT 'spotlight'::"payload"."enum__pages_v_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ALTER COLUMN "start_from" SET DATA TYPE "payload"."enum__pages_v_blocks_theme_studio_start_from" USING "start_from"::"payload"."enum__pages_v_blocks_theme_studio_start_from";
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE text;
  DELETE FROM "payload"."site_settings_general_themes" AS "added" WHERE "added"."value" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') AND EXISTS (SELECT 1 FROM "payload"."site_settings_general_themes" AS "kept" WHERE "kept"."parent_id" = "added"."parent_id" AND ("kept"."value" = 'spotlight' OR ("kept"."value" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') AND "kept"."id" < "added"."id")));
  UPDATE "payload"."site_settings_general_themes" SET "value" = CASE WHEN "value" = 'frost' THEN 'shadcn' WHEN "value" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') THEN 'spotlight' ELSE "value" END;
  UPDATE "payload"."site_settings" SET "general_default_theme" = CASE WHEN "general_default_theme" = 'frost' THEN 'shadcn' WHEN "general_default_theme" IN ('archipelago', 'midsummer', 'lingon', 'granite', 'aurora', 'cement') THEN 'spotlight' ELSE "general_default_theme" END;
  DROP TYPE "payload"."enum_site_settings_themes";
  CREATE TYPE "payload"."enum_site_settings_themes" AS ENUM('shadcn', 'spotlight', 'spotlight-fork', 'codeware');
  ALTER TABLE "payload"."site_settings_general_themes" ALTER COLUMN "value" SET DATA TYPE "payload"."enum_site_settings_themes" USING "value"::"payload"."enum_site_settings_themes";`);
}
