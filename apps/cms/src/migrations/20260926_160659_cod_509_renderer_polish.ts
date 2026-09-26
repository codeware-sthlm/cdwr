import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_navigation_appearance" AS ENUM('link', 'button');
  CREATE TYPE "payload"."enum_section_band" AS ENUM('none', 'subtle', 'strong');
  CREATE TYPE "payload"."enum_tech_icon" AS ENUM('cloudflare', 'docker', 'flyio', 'github', 'github-actions', 'graphql', 'linear', 'mongodb', 'netlify', 'nextjs', 'nodejs', 'nx', 'payload', 'pnpm', 'postgresql', 'react', 'redis', 'remix', 'sentry', 'storybook', 'stripe', 'supabase', 'tailwind', 'typescript', 'vercel', 'vite', 'vitest');
  CREATE TYPE "payload"."enum_pill_list_logo_source" AS ENUM('svg', 'upload');
  ALTER TABLE "payload"."navigation_items" ADD COLUMN "appearance" "payload"."enum_navigation_appearance" DEFAULT 'link';
  ALTER TABLE "payload"."pages_blocks_about" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_callout" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_card" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_code" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_form" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_image" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_social_media" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_content" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" ADD COLUMN "brand_tech" "payload"."enum_tech_icon";
  ALTER TABLE "payload"."pages_blocks_feature_cards" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_feature_section" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_file_area" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_hero" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_pill_list_items" ADD COLUMN "icon" "payload"."enum_tech_icon";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" ADD COLUMN "logo_source" "payload"."enum_pill_list_logo_source";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" ADD COLUMN "logo_svg_code" varchar;
  ALTER TABLE "payload"."pages_blocks_pill_list_items" ADD COLUMN "logo_file_id" integer;
  ALTER TABLE "payload"."pages_blocks_pill_list" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_posts" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_showcase" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_testimonial" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_theme_studio" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_tours" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_about" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_callout" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_card" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_code" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_form" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_image" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_social_media" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_content" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" ADD COLUMN "brand_tech" "payload"."enum_tech_icon";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_file_area" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_hero" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" ADD COLUMN "icon" "payload"."enum_tech_icon";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" ADD COLUMN "logo_source" "payload"."enum_pill_list_logo_source";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" ADD COLUMN "logo_svg_code" varchar;
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" ADD COLUMN "logo_file_id" integer;
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_posts" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_showcase" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."_pages_v_blocks_tours" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_card" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_code" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_form" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_image" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_social_media" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_content" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."reusable_content_blocks_file_area" ADD COLUMN "band" "payload"."enum_section_band" DEFAULT 'none';
  ALTER TABLE "payload"."pages_blocks_pill_list_items" ADD CONSTRAINT "pages_blocks_pill_list_items_logo_file_id_media_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" ADD CONSTRAINT "_pages_v_blocks_pill_list_items_logo_file_id_media_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_pill_list_items_logo_logo_file_idx" ON "payload"."pages_blocks_pill_list_items" USING btree ("logo_file_id");
  CREATE INDEX "_pages_v_blocks_pill_list_items_logo_logo_file_idx" ON "payload"."_pages_v_blocks_pill_list_items" USING btree ("logo_file_id");
  -- A pill list drew its own band from \`surface\`; the shared band takes over.
  -- A missing surface was drawn dark, so only 'light' comes across as no band
  UPDATE "payload"."pages_blocks_pill_list" SET "band" = CASE WHEN "surface" = 'light' THEN 'none' ELSE 'strong' END::"payload"."enum_section_band";
  UPDATE "payload"."_pages_v_blocks_pill_list" SET "band" = CASE WHEN "surface" = 'light' THEN 'none' ELSE 'strong' END::"payload"."enum_section_band";
  ALTER TABLE "payload"."pages_blocks_pill_list" DROP COLUMN "surface";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" DROP COLUMN "surface";
  DROP TYPE "payload"."enum_pill_list_surface";`);
}

export async function down({
  db,
  payload,
  req
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_pill_list_surface" AS ENUM('dark', 'light');
  ALTER TABLE "payload"."pages_blocks_pill_list_items" DROP CONSTRAINT "pages_blocks_pill_list_items_logo_file_id_media_id_fk";

  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" DROP CONSTRAINT "_pages_v_blocks_pill_list_items_logo_file_id_media_id_fk";

  DROP INDEX "payload"."pages_blocks_pill_list_items_logo_logo_file_idx";
  DROP INDEX "payload"."_pages_v_blocks_pill_list_items_logo_logo_file_idx";
  ALTER TABLE "payload"."pages_blocks_pill_list" ADD COLUMN "surface" "payload"."enum_pill_list_surface" DEFAULT 'dark';
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" ADD COLUMN "surface" "payload"."enum_pill_list_surface" DEFAULT 'dark';
  -- Back from the shared band: only a strong band was a dark surface
  UPDATE "payload"."pages_blocks_pill_list" SET "surface" = CASE WHEN "band" = 'strong' THEN 'dark' ELSE 'light' END::"payload"."enum_pill_list_surface";
  UPDATE "payload"."_pages_v_blocks_pill_list" SET "surface" = CASE WHEN "band" = 'strong' THEN 'dark' ELSE 'light' END::"payload"."enum_pill_list_surface";
  ALTER TABLE "payload"."navigation_items" DROP COLUMN "appearance";
  ALTER TABLE "payload"."pages_blocks_about" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_callout" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_card" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_code" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_form" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_image" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_social_media" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_content" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_feature_cards_items" DROP COLUMN "brand_tech";
  ALTER TABLE "payload"."pages_blocks_feature_cards" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_feature_section" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_file_area" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_hero" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" DROP COLUMN "icon";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" DROP COLUMN "logo_source";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" DROP COLUMN "logo_svg_code";
  ALTER TABLE "payload"."pages_blocks_pill_list_items" DROP COLUMN "logo_file_id";
  ALTER TABLE "payload"."pages_blocks_pill_list" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_posts" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_showcase" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_testimonial" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_theme_studio" DROP COLUMN "band";
  ALTER TABLE "payload"."pages_blocks_tours" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_about" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_callout" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_card" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_code" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_form" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_image" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_social_media" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_content" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards_items" DROP COLUMN "brand_tech";
  ALTER TABLE "payload"."_pages_v_blocks_feature_cards" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_feature_section" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_file_area" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_hero" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" DROP COLUMN "icon";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" DROP COLUMN "logo_source";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" DROP COLUMN "logo_svg_code";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list_items" DROP COLUMN "logo_file_id";
  ALTER TABLE "payload"."_pages_v_blocks_pill_list" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_posts" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_showcase" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_testimonial" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_theme_studio" DROP COLUMN "band";
  ALTER TABLE "payload"."_pages_v_blocks_tours" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_card" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_code" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_form" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_image" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_social_media" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_content" DROP COLUMN "band";
  ALTER TABLE "payload"."reusable_content_blocks_file_area" DROP COLUMN "band";
  DROP TYPE "payload"."enum_navigation_appearance";
  DROP TYPE "payload"."enum_section_band";
  DROP TYPE "payload"."enum_tech_icon";
  DROP TYPE "payload"."enum_pill_list_logo_source";`);
}
