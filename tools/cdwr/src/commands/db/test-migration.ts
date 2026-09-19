import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { input } from '../../cli/inputs';
import { preflight } from '../../cli/preflight';
import { backupsRoot, listBackups } from '../../services/backups';
import { runCmsScript } from '../../services/database';
import { run, sleep } from '../../services/shell';

import backupCommand from './backup';
import {
  appliedMigrations,
  extractPayloadSchema
} from './test-migration.logic';
import type { QueryFn, VerifyModule } from './verify-types';

const CONTAINER_NAME = 'postgres-cms-migration-test';
const CONTAINER_PORT = 5435;
const POSTGRES_DB = 'cms';
const POSTGRES_USER = 'postgres';
const POSTGRES_PASSWORD = 'postgres';
const TEST_DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${CONTAINER_PORT}/${POSTGRES_DB}`;
const READY_ATTEMPTS = 30;

async function isContainerRunning(): Promise<boolean> {
  const { stdout } = await run('docker', [
    'ps',
    '-q',
    '-f',
    `name=^/${CONTAINER_NAME}$`
  ]);
  return stdout.trim().length > 0;
}

async function stopContainer(): Promise<void> {
  try {
    await run('docker', ['stop', CONTAINER_NAME]);
  } catch {
    // nothing to stop
  }
}

async function waitReady(): Promise<void> {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await run('psql', [
        TEST_DATABASE_URL,
        '--no-password',
        '-t',
        '-A',
        '-c',
        'SELECT 1'
      ]);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error('Postgres container did not become ready after 30 seconds');
}

async function startContainer(): Promise<void> {
  await run('docker', [
    'run',
    '--name',
    CONTAINER_NAME,
    '--rm',
    '-d',
    '-e',
    `POSTGRES_DB=${POSTGRES_DB}`,
    '-e',
    `POSTGRES_USER=${POSTGRES_USER}`,
    '-e',
    `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
    '-p',
    `${CONTAINER_PORT}:5432`,
    'postgres:17'
  ]);
  await waitReady();
}

/** `psql -t -A -c <sql>`, trimmed; empty output reads as `undefined` */
async function psqlOutput(sql: string): Promise<string | undefined> {
  const { stdout } = await run('psql', [
    TEST_DATABASE_URL,
    '-t',
    '-A',
    '-c',
    sql
  ]);
  return stdout.trim() || undefined;
}

/** Filter a backup file to the payload schema and apply it; verifies it landed */
async function restorePart(
  dir: string,
  part: 'schema' | 'data'
): Promise<void> {
  const raw = readFileSync(join(dir, `${part}.sql`), 'utf8');
  const filtered = extractPayloadSchema(raw);
  const tmpFile = join(
    tmpdir(),
    `cdwr-test-migration-${part}-${randomUUID()}.sql`
  );
  writeFileSync(tmpFile, filtered, 'utf8');
  try {
    await run('psql', [
      TEST_DATABASE_URL,
      `--file=${tmpFile}`,
      '--no-password',
      '--set',
      'ON_ERROR_STOP=on'
    ]);
  } finally {
    rmSync(tmpFile, { force: true });
  }

  if (part === 'schema') {
    const schema = await psqlOutput(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'payload'"
    );
    if (schema !== 'payload') {
      throw new Error(
        'Schema restore appeared to succeed but the payload schema is missing'
      );
    }
  } else {
    const count = await psqlOutput(
      'SELECT COUNT(*) FROM payload.payload_migrations'
    );
    if (!count || count === '0') {
      throw new Error(
        'Data restore appeared to succeed but payload.payload_migrations is empty'
      );
    }
  }
}

function runMigrations(ctx: Context) {
  return runCmsScript(
    ctx.root,
    'run-migrations.ts',
    'development',
    { DATABASE_URL: TEST_DATABASE_URL, DATABASE_SCHEMA: 'payload' },
    ctx.env
  );
}

/** Runs `apps/cms/src/migrations/verify/<name>.ts` if it exists; `undefined` otherwise */
async function runVerifyHook(
  root: string,
  migrationName: string
): Promise<number | undefined> {
  const file = join(
    root,
    'apps/cms/src/migrations/verify',
    `${migrationName}.ts`
  );
  if (!existsSync(file)) return undefined;

  const mod = (await import(file)) as VerifyModule;
  const query: QueryFn = async (sql) => {
    const output = await psqlOutput(sql);
    return output
      ? output
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  };
  return mod.verify(query);
}

/**
 * Template for db/backup.ts reused here: when `fresh` is on, this calls that
 * command's own plan and apply, exactly as the interactive user flow would.
 */
export default defineCommand({
  summary: 'Run pending migrations against a backup in Docker',
  description:
    'Restores a CMS backup into a throwaway Postgres container, runs pending migrations against it, and runs the migration verify hook if it has one.',
  danger: 'mutate',
  confirm: 'never',
  needs: ['docker', 'psql'],
  inputs: {
    fresh: input.boolean({
      prompt: 'Create a fresh production backup first?',
      initial: false
    }),
    backup: input.optional(
      input.select<string>({
        prompt: 'Which backup to test against?',
        description: 'Backup folder under backups/',
        choices: (ctx) =>
          listBackups(ctx.root).map((b) => ({
            value: b.name,
            hint: `${b.environment} · ${b.takenAt}`
          }))
      }),
      (r) => !r['fresh']
    ),
    keep: input.boolean({
      prompt: 'Keep the container running afterwards?',
      initial: false
    })
  },

  async plan(ctx, { backup, fresh, keep }) {
    if (fresh) {
      // pg_dump/infisical are only needed for the fresh-backup path
      preflight(['pg_dump', 'infisical'], ctx.env);
    } else if (backup) {
      const dir = join(backupsRoot(ctx.root), backup);
      for (const file of ['schema.sql', 'data.sql']) {
        if (!existsSync(join(dir, file))) {
          throw new Error(`Backup '${backup}' is missing ${file}`);
        }
      }
    } else {
      throw new Error('Pass --backup or --fresh');
    }

    const steps = [
      fresh ? 'Create a fresh production backup' : `Use backup ${backup}`,
      'Stop any existing test-migration container',
      `Start Postgres 17 in Docker on port ${CONTAINER_PORT}`,
      'Restore the payload schema and data into the container',
      'Run pending migrations against the container',
      'Run the verify hook for the last migration, if one exists'
    ];
    if (!keep) steps.push('Stop the container afterwards');

    return { steps, data: { backup, fresh } };
  },

  async apply(ctx, { backup, fresh }, inputs) {
    const name = fresh
      ? await ctx.ui.task(
          'Creating a fresh production backup',
          async () => {
            const freshPlan = await backupCommand.plan(ctx, {
              environment: 'production',
              previewApp: undefined
            });
            await backupCommand.apply(ctx, freshPlan.data, {
              environment: 'production',
              previewApp: undefined
            });
            return basename(freshPlan.data.dir);
          },
          (n) => `Backup ${n} created`
        )
      : (backup as string);

    const dir = join(backupsRoot(ctx.root), name);

    if (await isContainerRunning()) {
      await ctx.ui.task('Stopping the existing test container', stopContainer);
    }
    await ctx.ui.task(
      `Starting Postgres on port ${CONTAINER_PORT}`,
      startContainer
    );

    try {
      await ctx.ui.task('Restoring schema', () => restorePart(dir, 'schema'));
      await ctx.ui.task('Restoring data', () => restorePart(dir, 'data'));

      const { stdout } = await ctx.ui.task('Running pending migrations', () =>
        runMigrations(ctx)
      );
      const applied = appliedMigrations(stdout);
      const lastMigration = await psqlOutput(
        'SELECT name FROM payload.payload_migrations ORDER BY id DESC LIMIT 1'
      );

      const details = [
        `Applied: ${applied.length ? applied.join(', ') : '(none)'}`,
        `Last recorded migration: ${lastMigration ?? '(none)'}`
      ];

      let checks: number | undefined;
      if (lastMigration) {
        checks = await runVerifyHook(ctx.root, lastMigration);
        details.push(
          checks === undefined
            ? 'No verify hook found for the last migration'
            : `Verify hook passed ${checks} check(s)`
        );
      }

      return {
        summary: `Migration test passed against ${name}`,
        details,
        next: inputs.keep
          ? [
              `Container stays up: DATABASE_URL=${TEST_DATABASE_URL}`,
              `Stop it with \`docker stop ${CONTAINER_NAME}\` when done`
            ]
          : undefined,
        json: { backup: name, applied, lastMigration, checks }
      };
    } finally {
      if (!inputs.keep) {
        await ctx.ui.task('Stopping the container', stopContainer);
      }
    }
  }
});
