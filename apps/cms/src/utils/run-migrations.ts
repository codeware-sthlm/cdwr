/**
 * Minimal non-interactive migration runner.
 *
 * Runs all pending Payload migrations against whatever DATABASE_URL is set
 * in the environment. Used by the test-migration db-tool to apply migrations
 * against a Docker Postgres container loaded with a database backup.
 *
 * Builds Payload the way the release does in `migrate.ts` — the minimal config,
 * the bundled migration list, no `onInit` — so the test exercises that path
 * rather than booting the whole app against a schema that is still behind.
 */
import { writeSync } from 'node:fs';

import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { type Migration, type Payload, getPayload } from 'payload';

import { getConfig } from '../migrate.config';
import { migrations } from '../migrations';

/** Written synchronously: `process.exit` drops whatever a pipe still buffers. */
const report = (fd: 1 | 2, line: string) => writeSync(fd, `${line}\n`);

let step = 'starting';
let finished = false;

// Exit code 0 with nothing applied reads as a pass. Whether something calls
// `process.exit(0)` early or the event loop simply drains, say where it stopped
// and fail instead
process.on('beforeExit', () => {
  if (!finished) process.exit(1);
});
process.on('exit', (code) => {
  if (finished) return;
  report(2, `[migrate] stopped while ${step} (exit ${code})`);
  process.exitCode = 1;
});

const recorded = async (payload: Payload) => {
  // A fresh database has no migrations table until the first migration makes it
  // The same default `migrate.config` applies, so the two cannot disagree
  const { pool, schemaName = 'payload' } =
    payload.db as unknown as PostgresAdapter;
  const { rows } = await pool.query<{ present: boolean }>(
    `SELECT to_regclass('"${schemaName}".payload_migrations') IS NOT NULL AS present`
  );
  if (!rows[0]?.present) return new Set<string>();

  const { docs } = await payload.find({
    collection: 'payload-migrations',
    pagination: false
  });
  return new Set(docs.map(({ name }) => name));
};

async function main() {
  // What Payload's own `migrate` sets: without it a development boot pushes the
  // schema first, records a dev-mode marker, and `migrate` then stops to ask
  // whether to proceed — waiting on a terminal that is not there
  process.env['PAYLOAD_MIGRATING'] = 'true';

  step = 'initialising payload';
  const payload = await getPayload({
    config: getConfig(),
    disableOnInit: true
  });

  step = 'reading recorded migrations';
  const before = await recorded(payload);
  const pending = migrations
    .map(({ name }) => name)
    .filter((n) => !before.has(n));
  report(
    1,
    `[migrate] ${migrations.length} bundled, ${before.size} recorded, pending: ${pending.join(', ') || '(none)'}`
  );

  step = 'migrating';
  await payload.db.migrate({ migrations: migrations as Migration[] });

  step = 'checking what was applied';
  const applied = [...(await recorded(payload))].filter((n) => !before.has(n));
  report(1, `[migrate] applied: ${applied.join(', ') || '(none)'}`);

  // Payload's default logger is async, so its lines are lost without a flush
  await new Promise<void>((resolve) => payload.logger.flush(() => resolve()));

  finished = true;
  process.exit(applied.length === pending.length ? 0 : 1);
}

main().catch((err) => {
  report(2, `[migrate] failed while ${step}`);
  report(2, err instanceof Error ? (err.stack ?? err.message) : String(err));
  finished = true;
  process.exit(1);
});
