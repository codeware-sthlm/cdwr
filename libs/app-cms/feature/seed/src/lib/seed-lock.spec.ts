import type { Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { withSeedLock } from './seed-lock';

/** `busyFor` try-locks fail before one succeeds; `Infinity` never frees */
const setup = (options: { busyFor: number; unlockFails?: boolean }) => {
  const queries: string[] = [];
  let tries = 0;
  const query = vi.fn(async (text: string) => {
    queries.push(text);
    if (text.includes('pg_advisory_unlock') && options.unlockFails) {
      throw new Error('connection lost');
    }
    if (text.includes('pg_try_advisory_lock')) {
      return { rows: [{ locked: tries++ >= options.busyFor }] };
    }
    return { rows: [] };
  });
  const listeners = new Set<(error: Error) => void>();
  const client = {
    query,
    release: vi.fn(),
    on: (_: 'error', listener: (error: Error) => void) =>
      listeners.add(listener),
    off: (_: 'error', listener: (error: Error) => void) =>
      listeners.delete(listener)
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const payload = {
    db: { pool: { connect: async () => client } },
    logger
  } as unknown as Payload;

  return { payload, queries, release: client.release, logger, listeners };
};

const fast = { timeoutMs: 50, pollMs: 1 };

describe('withSeedLock', () => {
  it.each([
    {
      name: 'takes a free lock without waiting',
      busyFor: 0,
      expected: ['pg_try_advisory_lock', 'pg_advisory_unlock'],
      waits: false
    },
    {
      name: 'waits for a lock another seed holds',
      busyFor: 2,
      expected: [
        'pg_try_advisory_lock',
        'pg_try_advisory_lock',
        'pg_try_advisory_lock',
        'pg_advisory_unlock'
      ],
      waits: true
    }
  ])('$name', async ({ busyFor, expected, waits }) => {
    const { payload, queries, release, logger, listeners } = setup({
      busyFor
    });

    await expect(
      withSeedLock(payload, async () => 'seeded', fast)
    ).resolves.toBe('seeded');

    expect(queries.map((text) => text.match(/pg_\w+/)?.[0])).toEqual(expected);
    expect(
      queries.every((text) => text.includes("hashtext('cdwr:seed')"))
    ).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(waits ? 1 : 0);
    expect(release).toHaveBeenCalledWith(false);
    expect(listeners.size).toBe(0);
  });

  it('gives up without seeding when the lock never frees', async () => {
    const { payload, release } = setup({ busyFor: Infinity });
    const fn = vi.fn(async () => 'seeded');

    await expect(withSeedLock(payload, fn, fast)).rejects.toThrow(
      'not seeding'
    );

    expect(fn).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(false);
  });

  it('unlocks and releases when the seed throws', async () => {
    const { payload, queries, release } = setup({ busyFor: 0 });

    await expect(
      withSeedLock(
        payload,
        async () => {
          throw new Error('seed broke');
        },
        fast
      )
    ).rejects.toThrow('seed broke');

    expect(queries.at(-1)).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledWith(false);
  });

  it('closes the connection when the unlock fails, keeping the result', async () => {
    const { payload, release, logger } = setup({
      busyFor: 0,
      unlockFails: true
    });

    await expect(
      withSeedLock(payload, async () => 'seeded', fast)
    ).resolves.toBe('seeded');

    expect(release).toHaveBeenCalledWith(true);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('survives the idle lock connection failing mid-seed', async () => {
    const { payload, release, logger, listeners } = setup({ busyFor: 0 });

    await expect(
      withSeedLock(
        payload,
        async () => {
          for (const listener of listeners)
            listener(new Error('socket hang up'));
          return 'seeded';
        },
        fast
      )
    ).resolves.toBe('seeded');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('socket hang up')
    );
    expect(release).toHaveBeenCalledWith(true);
  });

  it('refuses a database adapter without a pool', async () => {
    const payload = { db: {}, logger: {} } as unknown as Payload;

    await expect(withSeedLock(payload, async () => 'seeded')).rejects.toThrow(
      'needs the Postgres adapter'
    );
  });
});
