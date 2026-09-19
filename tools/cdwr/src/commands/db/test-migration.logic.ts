export interface DumpObject {
  name: string;
  type: string;
  schema: string;
}

// pg_dump header formats:
//   DDL:  -- Name: <name>; Type: <type>; Schema: <schema>; Owner: -
//   Data: -- Data for Name: <name>; Type: TABLE DATA; Schema: <schema>; Owner: -
const HEADER =
  /^-- (?:Data for )?Name:\s*(.+?);\s*Type:\s*(.+?);\s*Schema:\s*(.+?)\s*;/;

/** Parse one pg_dump object header line; undefined for anything else */
export function parseDumpHeader(line: string): DumpObject | undefined {
  const match = HEADER.exec(line);
  if (!match) return undefined;
  const [, name, type, schema] = match;
  return { name: name.trim(), type: type.trim(), schema: schema.trim() };
}

/**
 * Whether a dump object belongs in a payload-only restore: the payload
 * schema itself, everything inside it, and the public TYPE/ENUM objects
 * payload tables reference.
 */
export const isPayloadObject = (object: DumpObject): boolean =>
  object.schema === 'payload' ||
  (object.schema === '-' &&
    object.type === 'SCHEMA' &&
    object.name === 'payload') ||
  (object.schema === 'public' &&
    (object.type === 'TYPE' || object.type === 'ENUM'));

const SAFE_PREAMBLE = /^(--|SET |SELECT pg_catalog\.set_config)/;

/**
 * Keep only the `payload` schema from a Supabase pg_dump file. Supabase
 * dumps carry objects — pgsodium, pg_graphql, supabase_vault — that crash a
 * plain Postgres backend, so this keeps what payload needs rather than
 * excluding what it does not.
 */
export function extractPayloadSchema(sql: string): string {
  const kept: string[] = [];
  let seenFirstHeader = false;
  let inPayload = false;

  for (const line of sql.split('\n')) {
    const header = parseDumpHeader(line);
    if (header) {
      seenFirstHeader = true;
      inPayload = isPayloadObject(header);
    }

    if (inPayload) {
      kept.push(line);
    } else if (
      !seenFirstHeader &&
      (SAFE_PREAMBLE.test(line) || line.trim() === '')
    ) {
      // Preamble before the first object header: only safe boilerplate
      kept.push(line);
    }
  }
  return kept.join('\n');
}

/** Names on `run-migrations.ts`'s `[migrate] applied: a, b` line; `[]` for none */
export function appliedMigrations(stdout: string): string[] {
  const match = /^\[migrate\] applied: (.+)$/m.exec(stdout);
  if (!match) return [];
  const [, list] = match;
  return list.trim() === '(none)' ? [] : list.split(',').map((s) => s.trim());
}
