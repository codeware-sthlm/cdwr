import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError, UsageError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { readText, worktreeOf } from '../../services/agent-queue';
import { CommandError, childEnv, run } from '../../services/shell';

import { ENV_COPIES } from './agent.logic';
import { isTicket, worktreePath } from './worktree.logic';

/** Where the branch comes from when the checkout is created */
type Source = 'remote' | 'local' | 'new';

const succeeds = (cwd: string, args: string[]): Promise<boolean> =>
  run('git', args, { cwd }).then(
    () => true,
    () => false
  );

/** Whether origin has the branch; exit 2 means it doesn't, any other failure is an error */
const onOrigin = (cwd: string, branch: string): Promise<boolean> =>
  run('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], {
    cwd
  }).then(
    () => true,
    (error: unknown) => {
      if (error instanceof CommandError && error.code === 2) return false;
      throw error;
    }
  );

export default defineCommand({
  summary: 'Create the checkout for a ticket, beside this one',
  description:
    'Creates codeware-<ticket> beside this checkout on the given branch: the pushed branch when origin has it, else the local one, else a new one from origin/main. Copies the env files and installs dependencies. Run it again to resume; it only does what differs.',
  danger: 'mutate',
  inputs: {
    ticket: input.string({
      prompt: 'Which ticket?',
      description: 'Ticket id, such as COD-529',
      positional: true
    }),
    branch: input.string({
      prompt: 'Which branch?',
      description: "The ticket's git branch name"
    })
  },

  async plan(ctx, { ticket, branch }) {
    if (!isTicket(ticket)) {
      throw new UsageError(
        `${ticket} is not a ticket id`,
        'Use the form COD-529'
      );
    }
    const path = worktreePath(ctx.root, ticket);
    if (resolve(path) === resolve(worktreeOf(ctx))) {
      throw new CliError(`${path} is the agent worktree`);
    }
    const exists = existsSync(path);
    if (exists && !existsSync(join(path, '.git'))) {
      throw new CliError(`${path} exists and is not a git checkout`);
    }

    let source: Source = 'new';
    if (!exists) {
      // ls-remote reads without writing refs, so a dry run changes nothing
      if (await onOrigin(ctx.root, branch)) {
        source = 'remote';
      } else if (
        await succeeds(ctx.root, [
          'rev-parse',
          '--verify',
          '-q',
          `refs/heads/${branch}`
        ])
      ) {
        source = 'local';
      }
    }
    // The env files live in the main checkout; other worktrees may lack them
    const commonDir = await run(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: ctx.root }
    );
    const envSource = dirname(commonDir.stdout.trim());
    const envCopies = ENV_COPIES.filter((file) => {
      const ours = readText(join(envSource, file));
      return ours !== undefined && ours !== readText(join(path, file));
    });
    const deps = !existsSync(join(path, 'node_modules'));

    const labels: Record<Source, string> = {
      remote: `Create the worktree on origin/${branch}`,
      local: `Create the worktree on the local branch ${branch}`,
      new: `Create the worktree on a new branch ${branch} from origin/main`
    };
    const steps = [
      !exists && { label: labels[source], detail: path },
      ...envCopies.map((file) => ({
        label: `Copy ${file}`,
        detail: `from ${envSource}`
      })),
      deps && { label: 'Install dependencies', detail: 'pnpm install' }
    ].filter((step) => step !== false);

    const data = {
      root: ctx.root,
      envSource,
      path,
      branch,
      source,
      exists,
      envCopies,
      deps
    };
    if (steps.length === 0) {
      return { steps, nothing: `The worktree is ready at ${path}`, data };
    }
    return { steps, data };
  },

  async apply(ctx, data) {
    const { path, branch, root } = data;
    if (!data.exists) {
      await ctx.ui.task('Creating the worktree', async () => {
        await run('git', ['fetch', '-q', 'origin'], { cwd: root });
        switch (data.source) {
          case 'remote':
          case 'local':
            await run('git', ['worktree', 'add', path, branch], { cwd: root });
            break;
          case 'new':
            await run(
              'git',
              [
                'worktree',
                'add',
                '--no-track',
                '-b',
                branch,
                path,
                'origin/main'
              ],
              { cwd: root }
            );
            break;
        }
      });
    }
    for (const file of data.envCopies) {
      mkdirSync(dirname(join(path, file)), { recursive: true });
      copyFileSync(join(data.envSource, file), join(path, file));
      ctx.ui.info(`Copied ${file}`);
    }
    if (data.deps) {
      await ctx.ui.task('Installing dependencies in the worktree', () =>
        run('pnpm', ['install', '--frozen-lockfile'], {
          cwd: path,
          env: childEnv(ctx.env),
          timeout: 15 * 60_000
        })
      );
    }
    return {
      summary: `The worktree is ready at ${path}`,
      json: {
        path,
        branch,
        created: !data.exists,
        source: data.source,
        envCopies: data.envCopies,
        deps: data.deps
      }
    };
  }
});
