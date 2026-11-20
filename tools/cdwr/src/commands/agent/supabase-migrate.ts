import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { CommandError, childEnv, run } from '../../services/shell';

import {
  DB_URL_ENV,
  LEDGER_QUERY,
  MIGRATION_FILE,
  PSQL_ARGS,
  applySql,
  dryRunSql,
  firstErrorLine,
  ledgerMissing,
  migrationName,
  psqlEnv,
  transactionStatement
} from './supabase-migrate.logic';

const PSQL_TIMEOUT_MS = 5 * 60_000;

interface Connection {
  env: NodeJS.ProcessEnv;
}

/** psql with the url in the child's environment only; the SQL goes in on stdin */
async function psql(
  { env }: Connection,
  name: string,
  sql: string
): Promise<string> {
  try {
    const { stdout } = await run('psql', [...PSQL_ARGS, '-v', `file=${name}`], {
      env,
      input: sql,
      timeout: PSQL_TIMEOUT_MS
    });
    return stdout;
  } catch (error) {
    if (error instanceof CommandError) {
      throw new CliError(firstErrorLine(error.stderr));
    }
    throw error;
  }
}

function connect(vars: NodeJS.ProcessEnv): Connection {
  const url = vars[DB_URL_ENV];
  if (!url) throw new CliError(`${DB_URL_ENV} is not set`);
  try {
    return { env: childEnv(vars, psqlEnv(url)) };
  } catch (error) {
    // The message of libpqEnv never quotes the url
    throw new CliError(
      `${DB_URL_ENV}: ${error instanceof Error ? error.message : 'unusable'}`
    );
  }
}

/** Whether the ledger lists the migration; a ledger that does not exist yet lists nothing */
async function isApplied(conn: Connection, name: string): Promise<boolean> {
  try {
    return (await psql(conn, name, LEDGER_QUERY)).trim() !== '';
  } catch (error) {
    if (error instanceof CliError && ledgerMissing(error.message)) return false;
    throw error;
  }
}

function readMigration(root: string, file: string): string {
  const path = join(root, file);
  if (!existsSync(path)) throw new CliError(`${file} does not exist`);
  const sql = readFileSync(path, 'utf8');
  const statement = transactionStatement(sql);
  if (statement) {
    throw new CliError(
      `${file} has its own '${statement}' line; the transaction belongs to the wrapper, so remove it`
    );
  }
  return sql;
}

export default defineCommand({
  summary: 'Apply a queue migration to the agent-queue database, once',
  description: `Runs one file of tools/cdwr/agent-queue/supabase/migrations with psql against ${DB_URL_ENV} (a postgres:// url) and records it in public.applied_migrations. The plan asks that ledger first and, for a migration it does not list, runs the file in a transaction that is rolled back. The apply runs the file and the ledger row in one committed transaction. The url reaches psql through libpq's PG* environment variables, never its arguments. A file with its own begin, commit or rollback is refused.`,
  danger: 'mutate',
  confirm: 'always',
  needs: ['psql'],
  inputs: {
    file: input.string({
      prompt: 'Which migration?',
      description:
        'Path of the migration from the repository root, under tools/cdwr/agent-queue/supabase/migrations',
      positional: true,
      schema: z
        .string()
        .regex(MIGRATION_FILE, 'Not a migration of the agent queue')
    })
  },

  async plan(ctx, { file }) {
    const sql = readMigration(ctx.root, file);
    const conn = connect(ctx.env);
    const name = migrationName(file);

    const applied = await ctx.ui.task(
      `Reading the ledger for ${name}`,
      () => isApplied(conn, name),
      (done) => (done ? `${name} is applied` : `${name} is not applied`)
    );
    if (applied) {
      return {
        steps: [],
        // Not `nothing`: a dry run's json must still carry the state
        notes: [`${name} is already applied; applying it will fail`],
        target: { environment: 'production', name },
        json: { file, environment: 'production', applied: true, dryRun: null },
        data: { file }
      };
    }

    await ctx.ui.task(
      `Trying ${name} in a transaction that rolls back`,
      () => psql(conn, name, dryRunSql(sql)),
      () => 'The dry run passed'
    );
    return {
      steps: [`Apply ${name}`, 'Record it in public.applied_migrations'],
      target: { environment: 'production', name },
      json: { file, environment: 'production', applied: false, dryRun: 'ok' },
      data: { file }
    };
  },

  async apply(ctx, { file }) {
    const sql = readMigration(ctx.root, file);
    const conn = connect(ctx.env);
    const name = migrationName(file);

    if (await isApplied(conn, name)) {
      throw new CliError(`${name} is already applied`);
    }
    await ctx.ui.task(
      `Applying ${name}`,
      () => psql(conn, name, applySql(sql)),
      () => `${name} applied`
    );
    return {
      summary: `Applied ${name}`,
      json: { file, appliedAt: new Date().toISOString() }
    };
  }
});
