/** How a block names itself inside an editor state, quoted the way jsonb is. */
const blockTypeMedia =
  "'%' || chr(34) || 'blockType' || chr(34) || ': ' || chr(34) || 'media' || chr(34) || '%'";

export async function verify(
  query: (sql: string) => Promise<string[]>
): Promise<number> {
  let checks = 0;

  // No media block may be left in a layout
  const tables = [
    'pages_blocks_media',
    'reusable_content_blocks_media',
    '_pages_v_blocks_media'
  ];
  for (const table of tables) {
    const [left] = await query(`SELECT count(*) FROM payload.${table}`);
    if (left !== '0') {
      throw new Error(`${left} row(s) still in payload.${table}`);
    }
    checks++;
  }

  // Nor in an editor state, where the block is a blockType in JSON. Found the
  // way the migration finds them, so the two cannot check different sets —
  // and the quotes are built in SQL, since this query reaches psql through a
  // shell where a double quote of its own would end the command early
  const columns = await query(
    "SELECT table_name || ' ' || column_name FROM information_schema.columns WHERE table_schema = 'payload' AND data_type = 'jsonb' AND column_name IN ('rich_text', 'content', 'version_content', 'intro_content') ORDER BY 1"
  );
  if (columns.length === 0) {
    throw new Error('No editor state columns found to check');
  }
  for (const entry of columns) {
    const [table, column] = entry.split(' ');
    const [left] = await query(
      `SELECT count(*) FROM payload.${table} WHERE ${column}::text LIKE ${blockTypeMedia}`
    );
    if (left !== '0') {
      throw new Error(
        `${left} row(s) in payload.${table}.${column} still hold a media block`
      );
    }
  }
  console.log(`   ${columns.length} editor state column(s) hold none`);
  checks++;

  // What the layouts carry now, for the record. A count of what was converted
  // is not knowable here: the hook runs after the migration, where a block it
  // moved is an `image` block like any other
  const counts = await query(
    "SELECT 'pages ' || (SELECT count(*) FROM payload.pages_blocks_image) || ', reusable content ' || (SELECT count(*) FROM payload.reusable_content_blocks_image)"
  );
  console.log(`   image blocks: ${counts[0]}`);
  checks++;

  return checks;
}
