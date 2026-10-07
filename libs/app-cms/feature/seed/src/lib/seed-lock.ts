import type { Payload } from 'payload';

/** Advisory lock key: a stable number hashed from a namespaced name, not a bare constant */
const LOCK = "hashtext('cdwr:seed')";

/** How long a booting machine waits for another seed before giving up */
const WAIT_MS = 5 * 60_000;
const POLL_MS = 2_000;

type LockClient = {
  query: (text: string) => Promise<{ rows: ReadonlyArray<unknown> }>;
  on: (event: 'error', listener: (error: Error) => void) => unknown;
  off: (event: 'error', listener: (error: Error) => void) => unknown;
  /** `true` destroys the connection, which also drops its locks */
  release: (destroy?: boolean) => void;
};

type LockPool = { connect: () => Promise<LockClient> };

const isPool = (value: unknown): value is LockPool =>
  typeof value === 'object' &&
  value !== null &&
  'connect' in value &&
  typeof value.connect === 'function';

const poolOf = (payload: Payload): LockPool => {
  const db: unknown = payload.db;
  if (typeof db === 'object' && db !== null && 'pool' in db) {
    const { pool } = db;
    if (isPool(pool)) return pool;
  }
  throw new Error('[SEED] The seed lock needs the Postgres adapter');
};

const gotLock = (rows: ReadonlyArray<unknown>): boolean => {
  const [row] = rows;
  return (
    typeof row === 'object' &&
    row !== null &&
    'locked' in row &&
    row.locked === true
  );
};

/**
 * Runs `fn` while holding the seed's advisory lock, so machines booting
 * together seed one after another instead of racing on check-then-insert.
 *
 * A session lock on a connection of its own: the seed runs several
 * transactions, which a transaction lock would not span. A crashed process
 * takes the lock down with its connection, so nothing stays stuck.
 */
export const withSeedLock = async <T>(
  payload: Payload,
  fn: () => Promise<T>,
  wait: { timeoutMs: number; pollMs: number } = {
    timeoutMs: WAIT_MS,
    pollMs: POLL_MS
  }
): Promise<T> => {
  const client = await poolOf(payload).connect();
  let destroy = false;

  // The connection idles for the whole seed; a dropped socket must not
  // become an uncaught 'error' that takes the process down
  const onError = (error: Error) => {
    destroy = true;
    payload.logger.warn(
      `[SEED] The seed lock connection failed: ${error.message}`
    );
  };
  client.on('error', onError);

  const tryLock = async () =>
    gotLock(
      (await client.query(`select pg_try_advisory_lock(${LOCK}) as locked`))
        .rows
    );

  try {
    if (!(await tryLock())) {
      payload.logger.info(
        '[SEED] Another seed is running, waiting for it to finish'
      );
      // Polled rather than blocking, so a stalled seed elsewhere cannot hold
      // this machine's boot forever
      const deadline = Date.now() + wait.timeoutMs;
      while (!(await tryLock())) {
        if (Date.now() >= deadline) {
          throw new Error(
            `[SEED] Another seed held the lock for over ${Math.round(wait.timeoutMs / 1000)}s, not seeding`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, wait.pollMs));
      }
    }

    try {
      return await fn();
    } finally {
      try {
        await client.query(`select pg_advisory_unlock(${LOCK})`);
      } catch (error) {
        // Closing the connection releases the lock all the same
        destroy = true;
        payload.logger.warn(
          `[SEED] Could not release the seed lock, closing its connection: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    client.off('error', onError);
    client.release(destroy);
  }
};
