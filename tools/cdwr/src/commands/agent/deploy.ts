import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { CommandError, run, sleep } from '../../services/shell';

import {
  COMPOSE_SOURCE,
  CONTAINER,
  DEFAULT_WAIT_MINUTES,
  IMAGE_WORKFLOW,
  IMPLEMENT_LOCK,
  PAUSED,
  REMOTE_COMPOSE,
  REMOTE_IMAGE_ENV,
  RUN_LOCK,
  type Remote,
  type SessionState,
  assertHost,
  assertTag,
  headShaOf,
  isPid,
  isRunning,
  lockFile,
  lockOld,
  parseReport,
  parseRunning,
  pathExists,
  pause,
  pidAlive,
  pidIsWait,
  pull,
  report,
  sessionState,
  tagFromSha,
  ticketOfKey,
  unpause,
  up,
  uploadCompose,
  waitPlan,
  writeTag
} from './deploy.logic';

const REPO = 'codeware-sthlm/cdwr';

const ssh = (remote: Remote) =>
  run('ssh', remote.args, { input: remote.input });

/** The exit-code question `test -e` or `docker inspect` answers: true on 0, false on 1, an error otherwise */
async function succeeds(remote: Remote): Promise<boolean> {
  try {
    await ssh(remote);
    return true;
  } catch (error) {
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

async function running(host: string): Promise<boolean> {
  try {
    return parseRunning((await ssh(isRunning(host))).stdout);
  } catch (error) {
    // No container yet
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

/** The text of a file in a lock directory; empty when it is absent */
async function readLock(
  host: string,
  lock: string,
  name: string
): Promise<string> {
  try {
    return (await ssh(lockFile(host, lock, name))).stdout.trim();
  } catch (error) {
    if (!(error instanceof CommandError && error.code === 1)) throw error;
    return '';
  }
}

/** A lock is busy while its owner lives; mirrors how run.sh clears a stale one */
async function held(host: string, lock: string): Promise<boolean> {
  if (!(await succeeds(pathExists(host, lock)))) return false;
  const owner = await readLock(host, lock, 'pid');
  if (isPid(owner)) return succeeds(pidAlive(host, owner));
  // No pid yet: the owner may be between mkdir and write, so only an old lock is stale
  const old = (await ssh(lockOld(host, lock))).stdout.trim();
  return old === '';
}

/** Whether the process is a wait.sh; grep exits 2 when the process is gone */
async function isWait(host: string, pid: string): Promise<boolean> {
  try {
    await ssh(pidIsWait(host, pid));
    return true;
  } catch (error) {
    const code = error instanceof CommandError ? error.code : undefined;
    if (code === 1 || code === 2) return false;
    throw error;
  }
}

/** What the queue is doing; `key` is the launch key of a waiting or working implementing session */
interface Queue {
  state: SessionState;
  key?: string;
}

async function queue(host: string): Promise<Queue> {
  if (await held(host, RUN_LOCK)) return { state: 'working' };
  const locked = await succeeds(pathExists(host, IMPLEMENT_LOCK));
  const alive = locked && (await held(host, IMPLEMENT_LOCK));
  if (!alive) return { state: 'none' };
  const key = (await readLock(host, IMPLEMENT_LOCK, 'key')) || undefined;
  const waiting = await readLock(host, IMPLEMENT_LOCK, 'waiting');
  const waitingAlive =
    isPid(waiting) && (await succeeds(pidAlive(host, waiting)));
  const waitingIsWait = waitingAlive && (await isWait(host, waiting));
  return {
    state: sessionState({ locked, alive, waitingAlive, waitingIsWait }),
    key
  };
}

/** Polls until the queue is idle or its session only waits; undefined when the checks run out */
async function awaitIdle(
  host: string,
  checks: number,
  intervalMs: number
): Promise<Queue | undefined> {
  for (let i = 0; i < checks; i++) {
    if (i > 0) await sleep(intervalMs);
    const q = await queue(host);
    if (q.state !== 'working') return q;
  }
  return undefined;
}

async function latestImageTag(): Promise<string> {
  const { stdout } = await run('gh', [
    'api',
    `repos/${REPO}/actions/workflows/${IMAGE_WORKFLOW}/runs?branch=main&status=success&per_page=1`,
    '--jq',
    '.workflow_runs[0].head_sha'
  ]);
  const sha = headShaOf(stdout);
  if (!sha) {
    throw new CliError(
      'No successful image build found on main',
      EXIT.failed,
      'Pass --tag sha-<7 hex characters>'
    );
  }
  return tagFromSha(sha);
}

export default defineCommand({
  summary: 'Update the agent container on a host to a new image',
  description:
    'Over ssh: ships the compose file, waits for the queue to be idle, pulls the image and restarts the container. Without --tag the latest successful image build on main is used.',
  danger: 'mutate',
  needs: ['gh'],
  inputs: {
    host: input.string({
      prompt: 'Which host?',
      short: 'H',
      description: 'ssh name of the host, such as its Tailscale name'
    }),
    tag: input.string({
      prompt: 'Which image tag?',
      short: 't',
      description:
        'sha-<7 hex characters> or main; the latest image build on main when left out',
      default: ''
    }),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    }),
    force: input.boolean({
      prompt: 'Restart without waiting for the queue to be idle?',
      short: 'f',
      description:
        'Skip the idle wait and restart at once, cutting a session that is working',
      default: false
    })
  },

  async plan(ctx, { host, tag, wait, force }) {
    assertHost(host);
    const resolved = tag
      ? assertTag(tag)
      : await ctx.ui.task(
          'Finding the latest image build',
          latestImageTag,
          (t) => `Latest image build: ${t}`
        );
    const compose = readFileSync(join(ctx.root, COMPOSE_SOURCE), 'utf8');
    return {
      steps: [
        {
          label: force
            ? 'Pause the queue, without waiting for it to be idle'
            : 'Pause the queue and wait for it to be idle',
          detail: force
            ? 'the wait is skipped and a working session is cut; only when the container runs'
            : `up to ${wait} minutes, or until the session only waits in wait.sh; only when the container runs`
        },
        {
          label: 'Upload the compose file',
          detail: `${host}:${REMOTE_COMPOSE}`
        },
        {
          label: 'Set the image tag',
          detail: `${resolved} in ${REMOTE_IMAGE_ENV}`
        },
        { label: 'Pull the image' },
        { label: 'Restart the container' },
        { label: 'Resume the queue and report the image' }
      ],
      target: { name: host },
      ...(force ? { danger: 'destructive' as const } : {}),
      data: { host, tag: resolved, compose, wait, force }
    };
  },

  async apply(ctx: Context, { host, tag, compose, wait, force }) {
    const runs = await running(host);
    // A pause the user set stays; only one made here is lifted again
    const alreadyPaused = runs && (await succeeds(pathExists(host, PAUSED)));
    const created = runs && !alreadyPaused;
    if (created) await ssh(pause(host));

    // Only a pause made here is lifted again; false when the unpause did not go through
    const lift = async (): Promise<boolean> => {
      if (!created) return true;
      return succeeds(unpause(host)).catch(() => false);
    };
    const stillPaused = `The queue may still be paused: run \`ssh ${host} docker exec ${CONTAINER} rm -f ${PAUSED}\``;
    const failed = (error: unknown, resumed: boolean) => {
      const reason = error instanceof Error ? error.message : String(error);
      return new CliError(
        `Deploy of ${tag} failed: ${reason}`,
        EXIT.failed,
        resumed
          ? `Run the same deploy again, or pass --tag with the previous tag${created ? '; the queue was resumed' : ''}`
          : `${stillPaused}, then run the same deploy again or pass --tag with the previous tag`
      );
    };

    // What the deploy interrupts: a session waiting in wait.sh, or with --force one that was working
    let seen: Queue = { state: 'none' };
    const started = Date.now();
    const { intervalMs, checks } = waitPlan(wait);

    if (runs && !force) {
      let idle: Queue | undefined;
      try {
        idle = await ctx.ui.task(
          'Waiting for the queue to be idle',
          () => awaitIdle(host, checks, intervalMs),
          (q) => (q ? 'The queue is idle' : 'The queue stayed busy')
        );
      } catch (error) {
        throw failed(error, await lift());
      }
      if (idle) seen = idle;
      if (!idle) {
        const resumed = await lift();
        throw new CliError(
          `The queue was still busy after ${wait} minutes; nothing was changed`,
          EXIT.failed,
          resumed
            ? 'Try again later, or raise --wait'
            : `${stillPaused}, then try again later or raise --wait`
        );
      }
    }

    try {
      await ctx.ui.task(
        'Uploading the compose file',
        () => ssh(uploadCompose(host, compose)),
        () => 'Compose file uploaded'
      );
      await ssh(writeTag(host, tag));
      await ctx.ui.task(
        `Pulling ${tag}`,
        () => ssh(pull(host)),
        () => `Pulled ${tag}`
      );
    } catch (error) {
      throw failed(error, await lift());
    }

    // The pull takes a while: the session may have gone back to work since the first check
    if (runs) {
      try {
        if (force) {
          // Only looked at, to say what was cut
          seen = await queue(host).catch(() => seen);
        } else {
          const now = await queue(host);
          if (now.state !== 'working') {
            seen = now;
          } else {
            const left = await ctx.ui.task(
              'The session is working again, waiting for it',
              () => {
                const left = wait - (Date.now() - started) / 60_000;
                return awaitIdle(host, waitPlan(left).checks, intervalMs);
              },
              (q) => (q ? 'The queue is idle' : 'The queue stayed busy')
            );
            if (!left) {
              const resumed = await lift();
              throw new CliError(
                `The queue was busy again after the pull and stayed busy for ${wait} minutes; the image is pulled and the tag written, but the container was not restarted`,
                EXIT.failed,
                `Run the same deploy again to finish it${resumed ? '' : `; ${stillPaused}`}`
              );
            }
            seen = left;
          }
        }
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw failed(error, await lift());
      }
    }

    try {
      await ctx.ui.task(
        'Restarting the container',
        () => ssh(up(host)),
        () => 'Container restarted'
      );
    } catch (error) {
      // The old container if up never ran, else the new one; either way the queue must not stay paused
      throw failed(error, await lift());
    }

    let resumed = !created;
    // The new container reads the volume's paused file as it started
    for (let attempt = 0; created && !resumed && attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2000);
      resumed = await succeeds(unpause(host)).catch(() => false);
    }

    const { image, state } = parseReport((await ssh(report(host))).stdout);
    const stuck = !resumed;
    const cut = seen.state === 'waiting' || seen.state === 'working';
    const ticket = seen.key ? ticketOfKey(seen.key) : undefined;
    const who = seen.key
      ? `${ticket ? `${ticket} ` : 'a session '}(${seen.key})`
      : 'a session';
    return {
      summary: `Deployed ${tag} to ${host}`,
      details: [
        `Image ${image}`,
        `State ${state}`,
        ...(seen.state === 'waiting'
          ? [
              `Interrupted ${who}, which was waiting in wait.sh; the next tick resumes it`
            ]
          : []),
        ...(seen.state === 'working'
          ? [`Cut ${who} while it was working (--force)`]
          : []),
        ...(alreadyPaused
          ? ['The queue was already paused and stays paused']
          : [])
      ],
      next: stuck
        ? [
            `Resume the queue: remove ${PAUSED} in the container, or \`cdwr agent resume\` there`
          ]
        : undefined,
      partial: state !== 'running' || stuck,
      json: {
        host,
        tag,
        image,
        state,
        resumed: created && resumed,
        interrupted: cut ? (seen.key ?? 'unknown') : null
      }
    };
  }
});
