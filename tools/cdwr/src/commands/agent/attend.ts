import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isMainThread } from 'node:worker_threads';

import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { childEnv, run, runInteractive } from '../../services/shell';

import {
  type AttendState,
  attendPath,
  describeStart,
  describeStep,
  parseTicket,
  planAttend,
  ready,
  startLine,
  startPrompt,
  upToDate
} from './attend.logic';

const ticketSchema = z.string().transform((value, ctx) => {
  const ticket = parseTicket(value);
  if (ticket === undefined) {
    ctx.addIssue({ code: 'custom', message: 'expected a ticket like COD-123' });
    return z.NEVER;
  }
  return ticket;
});

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
    'Moves codeware-queue beside this checkout to origin/main, installs dependencies when the lockfile changed, then starts /work-queue there in this terminal, for the ticket when one is given. With --no-start, or where there is no terminal, it prints the line that starts it instead. Refuses a checkout with changes or on a branch.',
  danger: 'mutate',
  confirm: 'never',
  inputs: {
    ticket: input.string({
      prompt: 'Which ticket?',
      description: 'The ticket to start /work-queue on, such as COD-123',
      positional: true,
      optional: true,
      flagOnly: true,
      schema: ticketSchema
    }),
    start: input.boolean({
      prompt: 'Start the session?',
      description: 'Start /work-queue here once the checkout is current',
      short: 's',
      default: true,
      flagOnly: true
    }),
    path: input.string({
      prompt: 'Which checkout?',
      short: 'p',
      description: 'The checkout to refresh; codeware-queue beside this one',
      optional: true,
      flagOnly: true
    })
  },

  async plan(ctx, { path: given, ticket, start: starting }) {
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

    // A worker (the app) or a pipe has no terminal for the session to take over
    const terminal =
      !ctx.flags.json &&
      isMainThread &&
      Boolean(process.stdin.isTTY) &&
      Boolean(process.stdout.isTTY);
    const verdict = planAttend(state, path, { start: starting && terminal });
    if ('refuse' in verdict) throw new CliError(verdict.refuse);
    if (verdict.steps.includes('start')) {
      // Before anything moves, rather than after the install
      await run('claude', ['--version']).catch(() => {
        throw new CliError(
          'claude is not on PATH',
          EXIT.failed,
          `Once it is, start with: ${startLine(path, ticket)}`
        );
      });
    }

    const start = startLine(path, ticket);
    const data = {
      path,
      ticket,
      steps: verdict.steps,
      main: verdict.main,
      start
    };
    if (verdict.steps.length === 0) {
      return {
        steps: [],
        nothing: `${upToDate(verdict.main)}. Start with: ${start}`,
        data
      };
    }
    return {
      steps: verdict.steps.map((step) => ({
        label:
          step === 'start'
            ? describeStart(path, ticket)
            : describeStep(step, verdict.main),
        detail: path
      })),
      data
    };
  },

  async apply(ctx, { path, ticket, steps, main, start }) {
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
    if (!steps.includes('start')) {
      return {
        summary: `${ready(main)}. Start with: ${start}`,
        json: { path, main, steps, start }
      };
    }
    const exitCode = await runInteractive('claude', [startPrompt(ticket)], {
      cwd: path,
      env: childEnv(ctx.env)
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new CliError(
          'claude is not on PATH',
          EXIT.failed,
          `Once it is, start with: ${start}`
        );
      }
      throw error;
    });
    return {
      summary: `The ${startPrompt(ticket)} session in ${path} ended`,
      json: { path, main, steps, start, exitCode },
      partial: exitCode !== 0
    };
  }
});
