import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { sshExec } from '../../services/fly';
import { shellQuote } from '../../services/shell';

import { dropStatement, parseDatabaseList } from './drop.logic';

/** The URL is quoted for the remote shell and the password encoded for the URL */
const connectionString = (password: string) =>
  shellQuote(
    `postgres://postgres:${encodeURIComponent(password)}@localhost:5432/postgres`
  );

/** Drops one database over SSH; named apart from the command itself */
async function dropOneDatabase(
  cluster: string,
  password: string,
  name: string
): Promise<void> {
  const command = `psql ${connectionString(password)} -c ${shellQuote(dropStatement(name))}`;
  await sshExec(cluster, command);
}

export default defineCommand({
  summary: 'Drop databases from a Fly Postgres cluster',
  description:
    'Lists the databases on a cluster over SSH and drops the ones you pick.',
  danger: 'destructive',
  needs: ['fly'],
  inputs: {
    cluster: input.string({
      prompt: 'Which Postgres cluster?',
      default: 'pg-preview',
      remember: true
    }),
    password: input.secret({
      prompt: 'Password for the cluster?',
      schema: z.string().min(8, 'Password seems too short')
    }),
    databases: input.multiselect<string>({
      prompt: 'Which databases to drop?',
      min: 1,
      choices: async (_ctx, resolved) => {
        const cluster = resolved['cluster'] as string;
        const password = resolved['password'] as string;
        const query =
          'SELECT datname as name, pg_catalog.pg_get_userbyid(datdba) as owner, ' +
          'pg_encoding_to_char(encoding) as encoding, pg_size_pretty(pg_database_size(datname)) as size ' +
          'FROM pg_database WHERE datistemplate = false ORDER BY datname;';
        const command = `psql ${connectionString(password)} -t -A -F, -c ${shellQuote(query)}`;
        const output = await sshExec(cluster, command);
        return parseDatabaseList(output).map((db) => ({
          value: db.name,
          hint: `${db.size} | ${db.owner}`
        }));
      }
    })
  },

  async plan(_ctx, { cluster, databases }) {
    return {
      steps: databases.map((name) => `Drop database ${name} on ${cluster}`),
      target: {
        environment: cluster === 'pg-preview' ? 'preview' : 'production',
        name: cluster
      },
      data: { cluster, databases }
    };
  },

  async apply(ctx, { cluster, databases }, { password }) {
    const dropped: string[] = [];
    const failed: string[] = [];

    for (const name of databases) {
      try {
        await ctx.ui.task(
          `Dropping ${name}`,
          () => dropOneDatabase(cluster, password, name),
          () => `Dropped ${name}`
        );
        dropped.push(name);
      } catch (error) {
        failed.push(name);
        ctx.ui.warn(`Failed to drop ${name}: ${messageOf(error)}`);
      }
    }

    const partial = failed.length > 0;
    return {
      summary: partial
        ? `Dropped ${dropped.length}/${databases.length} database(s); failed: ${failed.join(', ')}`
        : `Dropped ${dropped.length} database(s) on ${cluster}`,
      partial,
      json: { cluster, dropped, failed }
    };
  }
});
