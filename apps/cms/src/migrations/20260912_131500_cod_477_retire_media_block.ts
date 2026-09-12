import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Move every `media` block onto the `image` block that replaced it.
 *
 * `media` is no longer offered in the admin, and Payload validates a document
 * against the blocks its field allows — so a page still carrying one renders
 * as before but can never be saved again. Both blocks hold one upload in the
 * same column, so the move is a copy and a delete.
 *
 * Two homes to visit. A block placed in a layout has its own table; one placed
 * inside a content column lives in that column's editor state, where it is a
 * `blockType` in JSON. The tables are named; the editor states are found, so a
 * collection that gains a rich text field later is covered without an edit.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "payload"."pages_blocks_image" ("_order", "_parent_id", "_path", "id", "media_id", "block_name")
  SELECT "_order", "_parent_id", "_path", "id", "media_id", "block_name"
  FROM "payload"."pages_blocks_media";
  DELETE FROM "payload"."pages_blocks_media";

  INSERT INTO "payload"."reusable_content_blocks_image" ("_order", "_parent_id", "_path", "id", "media_id", "block_name")
  SELECT "_order", "_parent_id", "_path", "id", "media_id", "block_name"
  FROM "payload"."reusable_content_blocks_media";
  DELETE FROM "payload"."reusable_content_blocks_media";

  -- A version row's id comes from the table's own sequence, so it is left out
  -- rather than carried over from the table being emptied
  INSERT INTO "payload"."_pages_v_blocks_image" ("_order", "_parent_id", "_path", "media_id", "_uuid", "block_name")
  SELECT "_order", "_parent_id", "_path", "media_id", "_uuid", "block_name"
  FROM "payload"."_pages_v_blocks_media";
  DELETE FROM "payload"."_pages_v_blocks_media";

  -- Every editor state in the schema, so a rich text field added to another
  -- collection is covered too. Named by column rather than by table: these
  -- four are what Payload writes an editor state into, which keeps the rename
  -- away from the jsonb holding themes, jobs, preferences and captions
  CREATE FUNCTION pg_temp.rename_media_block(node jsonb) RETURNS jsonb AS $fn$
    SELECT CASE jsonb_typeof(node)
      WHEN 'object' THEN coalesce(
        (
          SELECT jsonb_object_agg(
            key,
            CASE
              WHEN key = 'blockType' AND value = '"media"'::jsonb
                THEN '"image"'::jsonb
              ELSE pg_temp.rename_media_block(value)
            END
          )
          FROM jsonb_each(node)
        ),
        '{}'::jsonb
      )
      WHEN 'array' THEN coalesce(
        (
          SELECT jsonb_agg(pg_temp.rename_media_block(element))
          FROM jsonb_array_elements(node) AS element
        ),
        '[]'::jsonb
      )
      ELSE node
    END
  $fn$ LANGUAGE sql IMMUTABLE;

  -- Walked rather than string-replaced: only a blockType of its own is
  -- renamed, so a code sample or a sentence that happens to quote the same
  -- JSON is left as the editor wrote it. The text match only decides which
  -- rows are worth walking
  DO $mig$
  DECLARE
    column_record record;
  BEGIN
    FOR column_record IN
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'payload'
        AND data_type = 'jsonb'
        AND column_name IN ('rich_text', 'content', 'version_content', 'intro_content')
    LOOP
      EXECUTE format(
        'UPDATE payload.%I SET %I = pg_temp.rename_media_block(%I) WHERE %I::text LIKE ''%%"blockType": "media"%%''',
        column_record.table_name,
        column_record.column_name,
        column_record.column_name,
        column_record.column_name
      );
    END LOOP;
  END $mig$;`);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Deliberately nothing. Once moved, a converted block is an `image` block
  // like any other, and an `image` block authored afterwards is the same row —
  // so moving them back would drag along blocks that were never `media`.
  payload.logger.warn(
    'Rolling back cod_477_retire_media_block leaves the converted blocks as `image` blocks: the conversion cannot tell them apart from any other.'
  );
}
