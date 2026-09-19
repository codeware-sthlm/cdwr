import { mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { defineCommand } from '../../cli/command';
import { backupName, backupsRoot } from '../../services/backups';
import { resolveDatabaseUrl } from '../../services/database';
import { environmentInput, previewAppInput } from '../../services/environment';
import { run } from '../../services/shell';

/**
 * Template for a read-only command: one remembered input, a plan that only
 * reads, an apply that writes locally. Copy this shape for new commands.
 */
export default defineCommand({
  summary: 'Back up the CMS database with pg_dump',
  description:
    'Writes schema.sql and data.sql for one environment into a timestamped folder under backups/.',
  danger: 'read',
  needs: ['pg_dump', 'infisical'],
  inputs: {
    environment: environmentInput(),
    previewApp: previewAppInput()
  },

  async plan(ctx, { environment, previewApp }) {
    const databaseUrl = await ctx.ui.task(
      `Reading DATABASE_URL for ${environment}`,
      () => resolveDatabaseUrl(environment, previewApp),
      () => `DATABASE_URL for ${environment} resolved`
    );
    const dir = join(backupsRoot(ctx.root), backupName('cms', environment));
    return {
      steps: [
        `Dump the schema to ${relative(ctx.root, dir)}/schema.sql`,
        `Dump the data to ${relative(ctx.root, dir)}/data.sql`
      ],
      target: { environment },
      data: { databaseUrl, dir }
    };
  },

  async apply(ctx, { databaseUrl, dir }) {
    mkdirSync(dir, { recursive: true });
    const dump = (part: 'schema' | 'data') =>
      ctx.ui.task(`Dumping ${part}`, () =>
        run('pg_dump', [
          part === 'schema' ? '--schema-only' : '--data-only',
          '--no-acl',
          '--no-owner',
          `--file=${join(dir, `${part}.sql`)}`,
          databaseUrl
        ])
      );
    await dump('schema');
    await dump('data');
    const where = relative(ctx.root, dir);
    return {
      summary: `Backup written to ${where}`,
      json: { dir: where }
    };
  }
});
