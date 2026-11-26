import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { fly } from '../../services/fly';

import { GITHUB_TOKEN_ENV, githubGet } from './platform.collect';
import {
  type FlyApp,
  type PreviousSweep,
  type SweepContext,
  runSweep
} from './sweep.rules';

export const HOME_ENV = 'AGENT_QUEUE_HOME';
export const SWEEP_FILE = 'sweep.json';
export const LEDGER_FILE = 'implement-spend.jsonl';

const PullSchema = z.object({ state: z.enum(['open', 'closed']) });
const PreviousSchema = z.object({
  apps: z.record(z.string(), z.string()).catch({}),
  known: z.array(z.string()).catch([])
});

/** The real readers: Fly, GitHub (signed when run.sh gave a token) and the queue home */
export function sweepContext(env: NodeJS.ProcessEnv): SweepContext {
  const home = env[HOME_ENV] || undefined;
  const token = env[GITHUB_TOKEN_ENV] || undefined;
  let apps: Promise<FlyApp[]> | undefined;
  const states = new Map<number, Promise<'open' | 'closed' | null>>();
  return {
    // One Fly read for every rule
    apps: () =>
      (apps ??= fly()
        .apps.list()
        .then((list) => list.map(({ name, status }) => ({ name, status })))),
    pullRequest: (prNumber) => {
      if (!states.has(prNumber)) {
        states.set(
          prNumber,
          githubGet(`/pulls/${prNumber}`, PullSchema, token).then(
            ({ state }) => state,
            () => null
          )
        );
      }
      return states.get(prNumber) as Promise<'open' | 'closed' | null>;
    },
    ledger: async () => {
      const file = home && join(home, LEDGER_FILE);
      if (!file || !existsSync(file)) return null;
      return readFileSync(file, 'utf8').split('\n');
    },
    previous: async () => readPrevious(home)
  };
}

/** The previous sweep.json; null without one, and a file that doesn't parse makes rule 4 unchecked */
function readPrevious(home: string | undefined): PreviousSweep | null {
  const file = home && join(home, SWEEP_FILE);
  if (!file || !existsSync(file)) return null;
  return PreviousSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

interface Data {
  home: string;
}

export default defineCommand({
  summary: 'Check the platform for silent drift',
  description: `Checks outcomes against rules: no preview app on Fly whose pull request is closed, no app pending in two sweeps in a row, and a readable implement spend ledger. The pg-preview rules (orphaned databases and roles, the volume) report unchecked until the sweep can reach pg-preview. A rule whose source can't be read is unchecked, never a finding. Each finding has a stable key <rule>:<subject> and names the command that fixes it. With ${HOME_ENV} set it reads the ledger and the previous ${SWEEP_FILE} there and writes ${SWEEP_FILE}, whose "new" lists the keys the previous run didn't have; the scheduler runs it once a day and sends those as a notice.`,
  danger: 'mutate',
  // The scheduler runs it on a timer
  history: false,
  inputs: {},

  async plan(ctx) {
    const home = ctx.env[HOME_ENV] ?? '';
    return {
      steps: [
        'Read the Fly apps and the pull requests of preview apps',
        ...(home ? [`Read ${LEDGER_FILE} and the previous ${SWEEP_FILE}`] : []),
        'Check every rule',
        ...(home ? [`Write ${SWEEP_FILE}`] : [])
      ],
      data: { home } satisfies Data
    };
  },

  async apply(ctx, { home }) {
    const sweep = sweepContext({ ...ctx.env, [HOME_ENV]: home });
    const { findings, unchecked } = await runSweep(sweep);
    const previous = await sweep.previous().catch(() => null);
    const apps = await sweep.apps().catch(() => null);

    // A rule that went unchecked keeps its earlier keys known, so an outage doesn't notify them again
    const skipped = new Set(unchecked.map(({ rule }) => rule));
    const carried = (previous?.known ?? []).filter((key) =>
      skipped.has(key.slice(0, key.indexOf(':')))
    );
    const keys = findings.map(({ key }) => key);
    const known = [...new Set([...keys, ...carried])].sort();
    const added = keys.filter((key) => !previous?.known.includes(key));

    const body = {
      at: new Date().toISOString(),
      findings,
      unchecked,
      new: added,
      known,
      // A failed Fly read keeps the previous map, so a pending app is still caught on the next run
      apps: apps
        ? Object.fromEntries(apps.map(({ name, status }) => [name, status]))
        : (previous?.apps ?? {})
    };
    if (home) {
      const file = join(home, SWEEP_FILE);
      mkdirSync(home, { recursive: true });
      writeFileSync(`${file}.tmp`, `${JSON.stringify(body)}\n`, {
        mode: 0o600
      });
      chmodSync(`${file}.tmp`, 0o600);
      renameSync(`${file}.tmp`, file);
    }
    return {
      summary: `${findings.length} finding(s), ${added.length} new, ${unchecked.length} rule(s) unchecked`,
      json: body
    };
  }
});
