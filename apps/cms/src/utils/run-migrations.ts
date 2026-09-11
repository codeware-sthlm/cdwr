/**
 * Minimal non-interactive migration runner.
 *
 * Runs all pending Payload migrations against whatever DATABASE_URL is set
 * in the environment. Used by the test-migration db-tool to apply migrations
 * against a Docker Postgres container loaded with a database backup.
 */
import { writeSync } from 'node:fs';

import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import { type Payload, getPayload, readMigrationFiles } from 'payload';

import config from '../payload.config';

/** Written synchronously: `process.exit` drops whatever a pipe still buffers. */
const report = (fd: 1 | 2, line: string) => writeSync(fd, `${line}\n`);

const recorded = async (payload: Payload) => {
  const { docs } = await payload.find({
    collection: 'payload-migrations',
    pagination: false
  });
  return new Set(docs.map(({ name }) => name));
};

async function main() {
  await loadEnv();
  const payload = await getPayload({ config });

  const files = await readMigrationFiles({ payload });
  const before = await recorded(payload);
  const pending = files.map(({ name }) => name).filter((n) => !before.has(n));
  report(1, `[migrate] ${payload.db.migrationDir}`);
  report(
    1,
    `[migrate] ${files.length} files, ${before.size} recorded, pending: ${pending.join(', ') || '(none)'}`
  );

  await payload.db.migrate();

  const applied = [...(await recorded(payload))].filter((n) => !before.has(n));
  report(1, `[migrate] applied: ${applied.join(', ') || '(none)'}`);

  // Payload's default logger is async, so its lines are lost without a flush
  await new Promise<void>((resolve) => payload.logger.flush(() => resolve()));
  process.exit(0);
}

main().catch((err) => {
  report(2, err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
