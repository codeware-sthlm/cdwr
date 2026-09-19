import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { listBackups } from '../../services/backups';
import { cmsDatabaseUrl } from '../../services/database';
import { environmentInput } from '../../services/environment';
import { run } from '../../services/shell';

/** The `.sql` files a restore mode applies, in order */
export const filesFor = (mode: 'full' | 'data' | 'schema'): string[] =>
  mode === 'full'
    ? ['schema.sql', 'data.sql']
    : mode === 'schema'
      ? ['schema.sql']
      : ['data.sql'];

export default defineCommand({
  summary: 'Restore a backup into an environment with psql',
  description:
    'Applies a backup taken by `db backup` to an environment. Full restores schema then data.',
  danger: 'destructive',
  needs: ['psql', 'infisical'],
  inputs: {
    backup: input.select<string>({
      prompt: 'Which backup?',
      description: 'Backup folder under backups/',
      positional: true,
      choices: (ctx) =>
        listBackups(ctx.root).map((b) => ({
          value: b.name,
          hint: `${b.environment} · ${b.takenAt}`
        }))
    }),
    mode: input.enum(['full', 'data', 'schema'], {
      prompt: 'What to restore?',
      initial: 'full',
      hints: {
        full: 'schema then data',
        data: 'leaves schema untouched',
        schema: 'structure without data'
      }
    }),
    environment: environmentInput()
  },

  async plan(ctx, { backup, mode, environment }) {
    const dir = join('backups', backup);
    const files = filesFor(mode);
    const databaseUrl = await ctx.ui.task(
      `Reading DATABASE_URL for ${environment}`,
      () => cmsDatabaseUrl(environment),
      () => `DATABASE_URL for ${environment} read from Infisical`
    );
    return {
      steps: files.map((file) => `Apply ${join(dir, file)} to ${environment}`),
      target: { environment, name: environment },
      data: { databaseUrl, dir: join(ctx.root, dir), files }
    };
  },

  async apply(ctx, { databaseUrl, dir, files }, { backup, environment }) {
    for (const file of files) {
      const part = file.replace('.sql', '');
      await ctx.ui.task(`Restoring ${part}`, () =>
        // Without ON_ERROR_STOP psql keeps going and exits 0 after a failed statement
        run('psql', [
          databaseUrl,
          '--set',
          'ON_ERROR_STOP=on',
          `--file=${join(dir, file)}`,
          '--no-password'
        ])
      );
    }
    return {
      summary: `Restored ${files.join(', ')} from ${backup} to ${environment}`,
      json: { backup, environment, files }
    };
  }
});
