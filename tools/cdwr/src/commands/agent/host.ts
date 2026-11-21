import type { Context } from '../../cli/context';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { CommandError, hold, run, sleep } from '../../services/shell';

import {
  CONTAINER,
  IMPLEMENT_LOCK,
  LOCKED,
  LOCK_BUSY,
  PAUSED,
  REMOTE_DIR,
  REMOTE_LOCK,
  RUN_LOCK,
  type Remote,
  type SessionState,
  deployLock,
  isPid,
  isRunning,
  lockFile,
  lockOld,
  parseRunning,
  pathExists,
  pause,
  pidAlive,
  pidIsWait,
  restart,
  sessionState,
  unpause,
  vaultHash,
  waitPlan
} from './deploy.logic';
import { NOT_READY, VAULT_FILE, type VaultKey } from './rotate-fly.logic';

export const ssh = (remote: Remote) =>
  run('ssh', remote.args, { input: remote.input });

/** The exit-code question `test -e` or `docker inspect` answers: true on 0, false on 1, an error otherwise */
export async function succeeds(remote: Remote): Promise<boolean> {
  try {
    await ssh(remote);
    return true;
  } catch (error) {
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

export async function running(host: string): Promise<boolean> {
  try {
    return parseRunning((await ssh(isRunning(host))).stdout);
  } catch (error) {
    // No container yet
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
}

/** The text of a file in a lock directory; empty when it is absent */
export async function readLock(
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
export async function held(host: string, lock: string): Promise<boolean> {
  if (!(await succeeds(pathExists(host, lock)))) return false;
  const owner = await readLock(host, lock, 'pid');
  if (isPid(owner)) return succeeds(pidAlive(host, owner));
  // No pid yet: the owner may be between mkdir and write, so only an old lock is stale
  const old = (await ssh(lockOld(host, lock))).stdout.trim();
  return old === '';
}

/** Whether the process is a wait.sh; grep exits 2 when the process is gone */
export async function isWait(host: string, pid: string): Promise<boolean> {
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
export interface Queue {
  state: SessionState;
  key?: string;
}

export async function queue(host: string): Promise<Queue> {
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
export async function awaitIdle(
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

/**
 * Takes the host's deploy lock, so the self-deploy timer never swaps files,
 * pauses or records while this deploy does. The timer holds it for a whole
 * tick, up to its own 30-minute wait for the queue, so this waits as long as
 * the queue wait. A lock that can't be taken at all stops the deploy too:
 * going on without it is the race the lock is there for.
 */
export async function lockHost(
  ctx: Context,
  host: string,
  wait: number
): Promise<() => Promise<void>> {
  try {
    return await ctx.ui.task(
      'Taking the host deploy lock',
      () => hold('ssh', deployLock(host, wait * 60).args, LOCKED),
      () => 'Holding the host deploy lock'
    );
  } catch (error) {
    if (error instanceof CommandError && error.code === LOCK_BUSY) {
      throw new CliError(
        `The host's self-deploy held ${REMOTE_LOCK} for ${wait} minutes; nothing was changed`,
        EXIT.failed,
        'It is deploying a new build: try again later, or raise --wait'
      );
    }
    throw new CliError(
      `Could not take ${REMOTE_LOCK} on ${host}: ${error instanceof Error ? error.message : String(error)}`,
      EXIT.failed,
      `The host needs flock (util-linux) and ${REMOTE_DIR} writable by the ssh user`
    );
  }
}

/**
 * Runs the work with the queue paused and idle, as a deploy restarts the
 * container. The caller holds the host deploy lock. Only a pause made here is
 * lifted again; `resumed` is false when that unpause failed, with a warning
 * that names the command to run.
 */
export async function whileIdle<T>(
  ctx: Context,
  host: string,
  wait: number,
  work: () => Promise<T>,
  busy = 'nothing was changed'
): Promise<{ value: T; resumed: boolean }> {
  let resumed = true;
  if (!(await running(host))) {
    throw new CliError(
      `The agent container is not running on ${host}`,
      EXIT.failed
    );
  }
  const created = !(await succeeds(pathExists(host, PAUSED)));
  if (created) await ssh(pause(host));
  let value: T;
  try {
    const { intervalMs, checks } = waitPlan(wait);
    const idle = await ctx.ui.task(
      'Waiting for the queue to be idle',
      () => awaitIdle(host, checks, intervalMs),
      (q) => (q ? 'The queue is idle' : 'The queue stayed busy')
    );
    if (!idle) {
      throw new CliError(
        `The queue was still busy after ${wait} minutes; ${busy}`,
        EXIT.failed,
        'Try again later, or raise --wait'
      );
    }
    value = await work();
  } finally {
    // A restart keeps the container's files, the pause flag included
    if (created) {
      resumed = false;
      for (let attempt = 0; !resumed && attempt < 3; attempt++) {
        if (attempt > 0) await sleep(2000);
        resumed = await succeeds(unpause(host)).catch(() => false);
      }
      if (!resumed) {
        ctx.ui.warn(
          `The queue may still be paused: run \`ssh ${host} docker exec ${CONTAINER} rm -f ${PAUSED}\``
        );
      }
    }
  }
  return { value, resumed };
}

/** Restarts the agent container so secrets.sh reads the vault again, with the queue paused and idle */
export const restartContainer = (ctx: Context, host: string) =>
  ctx.ui.task(
    'Restarting the container',
    () => ssh(restart(host)),
    () => 'Container restarted'
  );

const VAULT_POLL_MS = 3_000;
export const VAULT_POLL_MAX_MS = 90_000;

export type ContainerHash =
  { kind: 'hash'; hash: string } | { kind: 'not-ready' };

/** The sha256 of the key as the running container holds it, polled while the vault file is not written yet */
export async function containerHash(
  host: string,
  key: VaultKey
): Promise<ContainerHash> {
  for (let waited = 0; ; waited += VAULT_POLL_MS) {
    try {
      const { stdout } = await ssh(vaultHash(host, key));
      return { kind: 'hash', hash: stdout.trim() };
    } catch (error) {
      if (!(error instanceof CommandError && error.code === NOT_READY)) {
        throw error;
      }
    }
    if (waited >= VAULT_POLL_MAX_MS) return { kind: 'not-ready' };
    await sleep(VAULT_POLL_MS);
  }
}

/** Why the restarted container does not hold the new value of the key, by its sha256; undefined when it does */
export async function containerProblem(
  host: string,
  key: VaultKey,
  hash: string,
  what = 'value'
): Promise<string | undefined> {
  try {
    const held = await containerHash(host, key);
    if (held.kind === 'not-ready') {
      return `the container never wrote ${VAULT_FILE} within ${VAULT_POLL_MAX_MS / 1000} s; check \`cdwr agent logs\``;
    }
    return held.hash === hash
      ? undefined
      : `the container does not hold the new ${what}. A key set in the NUC's compose .env wins over the vault (the start log says "secrets: kept from the environment"); remove it there`;
  } catch (error) {
    return `the container's value could not be read: ${messageOf(error)}`;
  }
}

/** The restart alone under `whileIdle`; false when the queue may still be paused */
export async function restartIdleLocked(
  ctx: Context,
  host: string,
  wait: number
): Promise<boolean> {
  const { resumed } = await whileIdle(
    ctx,
    host,
    wait,
    () => restartContainer(ctx, host),
    'the container was not restarted'
  );
  return resumed;
}
