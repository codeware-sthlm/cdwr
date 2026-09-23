// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cancel, confirm, intro, note } from '@clack/prompts';
import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import { seed } from '@codeware/app-cms/feature/seed';
import { sql } from '@payloadcms/db-postgres';
import type { DrizzleAdapter, PostgresDB } from '@payloadcms/drizzle';
import type { CollectionSlug } from 'payload';
import { getMigrations, getPayload } from 'payload';

import config from '../payload.config';

/** Collections created by the seed — checked for row count integrity */
const SEEDED_COLLECTIONS = [
  'categories',
  'media',
  'navigation',
  'pages',
  'places',
  'platform-labels',
  'posts',
  'site-settings',
  'stock-media',
  'tags',
  'tenants',
  'tours',
  'users'
] as const satisfies readonly CollectionSlug[];

type SeededCollection = (typeof SEEDED_COLLECTIONS)[number];
type CountSnapshot = Record<SeededCollection, number>;

/**
 * Snapshot row counts for all seeded collections.
 * Returns -1 for any collection whose table does not exist yet.
 */
async function snapshotCounts(payload: Awaited<ReturnType<typeof getPayload>>) {
  const snapshot = {} as CountSnapshot;
  for (const collection of SEEDED_COLLECTIONS) {
    try {
      const { totalDocs } = await payload.count({ collection });
      snapshot[collection] = totalDocs;
    } catch {
      snapshot[collection] = -1;
    }
  }
  return snapshot;
}

/**
 * Assert that all seeded collections have a non-zero count.
 * Exits the process when any collection is empty or missing.
 */
function assertNonZeroCounts(counts: CountSnapshot, label: string) {
  const empty = Object.entries(counts).filter(([, count]) => count <= 0);
  if (empty.length > 0) {
    console.error(
      `❌ ${label}: expected non-zero counts but found:\n` +
        empty.map(([col, n]) => `  ${col}: ${n}`).join('\n')
    );
    process.exit(1);
  }
}

/**
 * Assert that row counts after re-apply match the counts recorded before rollback.
 * Exits the process when counts differ.
 */
function assertCountsMatch(before: CountSnapshot, after: CountSnapshot) {
  const mismatches = Object.entries(before).filter(
    ([col, count]) => after[col as SeededCollection] !== count
  );
  if (mismatches.length > 0) {
    console.error(
      '❌ Row counts after re-apply do not match pre-rollback counts:\n' +
        mismatches
          .map(
            ([col, expected]) =>
              `  ${col}: expected ${expected}, got ${after[col as SeededCollection]}`
          )
          .join('\n')
    );
    process.exit(1);
  }
}

/**
 * Scan the migration file for ADD COLUMN ... NOT NULL DEFAULT statements.
 * These defaults are placeholders chosen to make the migration runnable —
 * the real value must be decided before deploying to production.
 */
function warnAboutManualDefaults(migrationName: string) {
  const filePath = join(process.cwd(), 'src/migrations', `${migrationName}.ts`);
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    console.warn(`⚠️  Could not read migration file: ${filePath}`);
    return;
  }

  // Determine block boundaries so we can label up vs down in the output
  const downStart = source.indexOf('export async function down');

  const pattern =
    /ALTER TABLE "[^"]*"\."([^"]+)" ADD COLUMN "([^"]+)" ([^\n]+?) NOT NULL DEFAULT ([^;]+);/g;

  const findings: Array<{
    block: 'up' | 'down';
    table: string;
    column: string;
    default: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const block = downStart !== -1 && match.index > downStart ? 'down' : 'up';
    findings.push({
      block,
      table: match[1],
      column: match[2],
      default: match[4].trim()
    });
  }

  if (findings.length === 0) return;

  console.warn(
    '\n⚠️  Columns with placeholder defaults — review before deploying:'
  );
  for (const f of findings) {
    console.warn(
      `   [${f.block}] ${f.table}.${f.column}  →  DEFAULT ${f.default}`
    );
  }
  console.warn('');
}

/**
 * Query table names in the given schema from information_schema.
 */
async function getTableSet(
  adapter: DrizzleAdapter,
  schema = 'payload'
): Promise<Set<string>> {
  const result = await (adapter.drizzle as PostgresDB).execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} ORDER BY table_name`
  );
  return new Set(result.rows.map((r) => r.table_name as string));
}

/**
 * This script is used to verify the last migration.
 *
 * - Drops the entire database (including schema) to simulate a blank preview environment.
 * - Replays all migrations from scratch.
 * - Seeds the database.
 * - Asserts all seeded collections have non-zero row counts.
 * - Records row counts and table set as baseline before rollback.
 * - Bumps the batch number of the last migration to be unique.
 * - Rolls back the last migration.
 * - Asserts the table set changed (migration had structural effect).
 * - Re-applies the last migration.
 * - Asserts row counts and table set match the pre-rollback baseline.
 *
 * This ensures that the last migration can be applied and rolled back
 * without issues, and that data and schema survive the round-trip.
 *
 * Possible improvement: before rolling back, patch the database with
 * values that the down migration expects in columns that the up
 * migration removes (e.g. locale sub-table data back onto parent rows).
 * This makes the rollback test more realistic for migrations that
 * denormalise locale data.
 */
async function verifyLastMigration() {
  intro('Verify the last migration');
  const answer = await confirm({
    message: 'This will reset your local development database. Continue?',
    active: 'Yes',
    inactive: 'No',
    initialValue: false
  });
  if (answer !== true) {
    cancel('Exit verify last migration.');
    process.exit(0);
  }

  const env = await loadEnv();

  if (!env) {
    console.warn('Environment variables could not be loaded, abort');
    process.exit(0);
  }

  if (env.DEPLOY_ENV !== 'development') {
    console.error(
      'Error: Verify last migration is for development environment only!'
    );
    process.exit(0);
  }

  const start = Date.now();

  const payload = await getPayload({ config });
  const adapter = payload.db as unknown as DrizzleAdapter;

  // Drop everything (tables, enums, schema) to simulate a blank preview database,
  // then replay all migrations from scratch
  console.log('🔄 Drop database...');
  await payload.db.dropDatabase({ adapter });

  console.log('🔄 Run migrations on clean database...');
  await payload.db.migrate();

  note('Applied migrations on clean database');

  // Seed the database
  console.log('🔄 Run seed database...');
  const seedOk = await seed({
    environment: 'development',
    payload,
    remoteDataUrl: env.SEED_DATA_URL,
    source: 'local',
    strategy: 'once'
  });

  if (!seedOk) {
    console.error('❌ Seed failed — aborting verification');
    process.exit(1);
  }

  note('Seeded database');

  // Assert all seeded collections have data
  console.log('🔍 Assert seed produced data...');
  const countsBefore = await snapshotCounts(payload);
  assertNonZeroCounts(countsBefore, 'After seed');
  console.log(
    '☑️ Seeded collections: ' +
      Object.entries(countsBefore)
        .map(([col, n]) => `${col}(${n})`)
        .join(', ')
  );

  // Record table set before rollback as the expected state after re-apply
  const tablesBeforeDown = await getTableSet(adapter);
  console.log(`☑️ Tables in schema: ${tablesBeforeDown.size}`);

  // The last migration must have a different batch number than the one before it,
  // so get the last migration and update its batch number to be higher than the previous one.
  console.log('🔄 Bump last migration batch number to be unique...');
  const { existingMigrations, latestBatch } = await getMigrations({ payload });
  console.log(`☑️ Found ${existingMigrations.length} existing migrations`);
  const lastMigration = existingMigrations
    .sort((a, b) => Number(a.id) - Number(b.id))
    .at(-1);
  if (!lastMigration?.id) {
    console.error('❌ No migrations found after fresh migrate!');
    process.exit(1);
  }
  await payload.update({
    collection: 'payload-migrations',
    id: lastMigration.id,
    data: { batch: latestBatch + 1 }
  });

  note(`Bumped batch number on ${lastMigration.name}\n`);

  // Now rollback the last migration
  console.log('🔄 Run down migration...');
  await payload.db.migrateDown();

  note('Rolled back last migration');

  // Assert that the rollback changed the table set (migration had structural effect)
  const tablesAfterDown = await getTableSet(adapter);
  if (tablesAfterDown.size === tablesBeforeDown.size) {
    console.warn(
      '⚠️  Table count unchanged after rollback — migration may not have structural changes'
    );
  } else {
    const added = [...tablesAfterDown].filter((t) => !tablesBeforeDown.has(t));
    const removed = [...tablesBeforeDown].filter(
      (t) => !tablesAfterDown.has(t)
    );
    if (added.length)
      console.log(`☑️ Rollback restored tables: ${added.join(', ')}`);
    if (removed.length)
      console.log(`☑️ Rollback removed tables: ${removed.join(', ')}`);
  }

  // Migrate again to apply the last migration
  console.log('🔄 Run migration to apply the last migration again...');
  await payload.db.migrate();

  note('Re-applied last migration');

  // Assert table set is restored
  const tablesAfterUp = await getTableSet(adapter);
  const missingTables = [...tablesBeforeDown].filter(
    (t) => !tablesAfterUp.has(t)
  );
  const unexpectedTables = [...tablesAfterUp].filter(
    (t) => !tablesBeforeDown.has(t)
  );
  if (missingTables.length || unexpectedTables.length) {
    if (missingTables.length) {
      console.error(
        `❌ Tables missing after re-apply: ${missingTables.join(', ')}`
      );
    }
    if (unexpectedTables.length) {
      console.error(
        `❌ Unexpected tables after re-apply: ${unexpectedTables.join(', ')}`
      );
    }
    process.exit(1);
  }
  console.log(`☑️ Table set restored (${tablesAfterUp.size} tables)`);

  // Assert row counts survived the round-trip
  console.log('🔍 Assert row counts survived round-trip...');
  const countsAfter = await snapshotCounts(payload);
  assertCountsMatch(countsBefore, countsAfter);
  console.log('☑️ All row counts match pre-rollback baseline');

  // Warn about any NOT NULL DEFAULT values that need a business decision
  warnAboutManualDefaults(lastMigration.name);

  const end = Date.now();
  note(`Duration ${end - start} ms`, 'Last migration verified successfully');
  process.exit(0);
}

verifyLastMigration().catch((err) => {
  console.error('❌ Verify last migration failed');
  console.error(err);
  process.exit(1);
});
