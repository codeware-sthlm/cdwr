import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
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

const MARKER = join('node_modules', '.cdwr-lockfile');

/** Whether node_modules was installed from the checkout's current lockfile */
const markerMatches = async (path: string): Promise<boolean> => {
  const marker = await readFile(join(path, MARKER), 'utf8').catch(
    () => undefined
  );
  const lock = await git(path, ['hash-object', 'pnpm-lock.yaml']).catch(
    () => undefined
  );
  return marker !== undefined && lock !== undefined && marker.trim() === lock;
};

/** origin/main as the remote says, without touching any ref */
const remoteMain = async (path: string): Promise<string> => {
  const line = await git(path, ['ls-remote', 'origin', 'refs/heads/main']);
  const sha = line.split(/\s+/)[0] ?? '';
  if (sha === '') throw new CliError('origin has no main branch');
  return sha;
};

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
      markerMatches: false
    };
    if (exists) {
      const theirs = await commonDir(path).catch(() => undefined);
      const ofThisClone =
        theirs !== undefined && theirs === (await commonDir(ctx.root));
      if (ofThisClone) {
        // Plan only reads; the fetch waits for apply
        const head = await git(path, ['rev-parse', 'HEAD']);
        const main = await remoteMain(path);
        state = {
          exists,
          ofThisClone,
          dirty: (await git(path, ['status', '--porcelain'])) !== '',
          detached: (await git(path, ['branch', '--show-current'])) === '',
          head,
          main,
          markerMatches: await markerMatches(path)
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
      await ctx.ui.task('Switching to origin/main', async () => {
        await run('git', ['-C', path, 'fetch', '-q', 'origin', 'main']);
        // The commit the plan saw, even if main has moved since
        await run('git', [
          '-C',
          path,
          'cat-file',
          '-e',
          `${main}^{commit}`
        ]).catch(() => {
          throw new CliError(
            `origin/main moved past ${main.slice(0, 8)} since the plan; run again`
          );
        });
        await run('git', ['-C', path, 'switch', '-q', '--detach', main]);
      });
    }
    if (steps.includes('install') && !(await markerMatches(path))) {
      await ctx.ui.task('Installing dependencies', async () => {
        await run('pnpm', ['install', '--frozen-lockfile'], {
          cwd: path,
          env: childEnv(ctx.env),
          timeout: 15 * 60_000
        });
        const lock = await git(path, ['hash-object', 'pnpm-lock.yaml']);
        await writeFile(join(path, MARKER), `${lock}\n`);
      });
    }
    return {
      summary: `${ready(main)}. Start with: ${start}`,
      json: { path, main, steps, start }
    };
  }
});
