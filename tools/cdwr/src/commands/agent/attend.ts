import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { childEnv, run } from '../../services/shell';

import {
  type AttendState,
  attendPath,
  describeStep,
  planAttend,
  ready,
  startLine,
  upToDate
} from './attend.logic';

const git = async (cwd: string, args: string[]): Promise<string> =>
  (await run('git', args, { cwd })).stdout.trim();

const commonDir = (cwd: string): Promise<string> =>
  git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);

const differs = (cwd: string, head: string, main: string): Promise<boolean> =>
  run('git', ['diff', '--quiet', head, main, '--', 'pnpm-lock.yaml'], {
    cwd
  }).then(
    () => false,
    () => true
  );

export default defineCommand({
  summary: 'Refresh the checkout an attended session runs from',
  description:
    'Moves codeware-queue beside this checkout to origin/main, installs dependencies when the lockfile changed, then prints the line that starts /work-queue there. Refuses a checkout with changes or on a branch. It does not start the session.',
  danger: 'mutate',
  inputs: {
    path: input.string({
      prompt: 'Which checkout?',
      short: 'p',
      description: 'The checkout to refresh; codeware-queue beside this one',
      optional: true,
      flagOnly: true
    })
  },

  async plan(ctx, { path: given }) {
    const path = given ? resolve(given) : attendPath(ctx.root);
    const exists = existsSync(join(path, '.git'));
    let state: AttendState = {
      exists,
      ofThisClone: false,
      dirty: false,
      detached: false,
      head: '',
      main: '',
      lockfileChanged: false,
      hasNodeModules: false
    };
    if (exists) {
      const theirs = await commonDir(path).catch(() => undefined);
      const ofThisClone =
        theirs !== undefined && theirs === (await commonDir(ctx.root));
      if (ofThisClone) {
        // A fetch moves remote-tracking refs only, not the working tree
        await run('git', ['fetch', '-q', 'origin'], { cwd: path });
        const head = await git(path, ['rev-parse', 'HEAD']);
        const main = await git(path, ['rev-parse', 'origin/main']);
        state = {
          exists,
          ofThisClone,
          dirty: (await git(path, ['status', '--porcelain'])) !== '',
          detached: (await git(path, ['branch', '--show-current'])) === '',
          head,
          main,
          lockfileChanged: await differs(path, head, main),
          hasNodeModules: existsSync(join(path, 'node_modules'))
        };
      } else {
        state = { ...state, exists, ofThisClone };
      }
    }

    const verdict = planAttend(state, path);
    if ('refuse' in verdict) throw new CliError(verdict.refuse);

    const start = startLine(path);
    const data = { path, steps: verdict.steps, main: verdict.main, start };
    if (verdict.steps.length === 0) {
      return {
        steps: [],
        nothing: `${upToDate(verdict.main)}. Start with: ${start}`,
        data
      };
    }
    return {
      steps: verdict.steps.map((step) => ({
        label: describeStep(step, verdict.main),
        detail: path
      })),
      data
    };
  },

  async apply(ctx, { path, steps, main, start }) {
    if (steps.includes('switch')) {
      await ctx.ui.task('Switching to origin/main', () =>
        // The commit the plan checked, even if a fetch has moved origin/main since
        run('git', ['-C', path, 'switch', '-q', '--detach', main])
      );
    }
    if (steps.includes('install')) {
      await ctx.ui.task('Installing dependencies', () =>
        run('pnpm', ['install', '--frozen-lockfile'], {
          cwd: path,
          env: childEnv(ctx.env),
          timeout: 15 * 60_000
        })
      );
    }
    return {
      summary: `${ready(main)}. Start with: ${start}`,
      json: { path, main, steps, start }
    };
  }
});
