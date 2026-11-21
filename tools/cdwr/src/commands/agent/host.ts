import { CommandError, run, sleep } from '../../services/shell';

import {
  IMPLEMENT_LOCK,
  RUN_LOCK,
  type Remote,
  type SessionState,
  isPid,
  isRunning,
  lockFile,
  lockOld,
  parseRunning,
  pathExists,
  pidAlive,
  pidIsWait,
  sessionState
} from './deploy.logic';

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
