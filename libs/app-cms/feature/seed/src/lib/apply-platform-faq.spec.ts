import type { Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { applyPlatformFaq } from './apply-platform-faq';

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('applyPlatformFaq', () => {
  it('logs and never throws when the FAQ cannot be applied', async () => {
    const log = logger();
    // No Postgres pool, so the seed lock refuses
    const payload = { db: {}, logger: log } as unknown as Payload;

    await expect(applyPlatformFaq(payload)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('[FAQ] Could not apply the platform FAQ')
    );
  });

  it('rolls back and logs when an entry fails mid-way', async () => {
    const log = logger();
    const client = {
      query: async () => ({ rows: [{ locked: true }] }),
      on: () => undefined,
      off: () => undefined,
      release: () => undefined
    };
    const rollbackTransaction = vi.fn();
    const commitTransaction = vi.fn();
    const payload = {
      db: {
        pool: { connect: async () => client },
        beginTransaction: async () => 't1',
        commitTransaction,
        rollbackTransaction
      },
      logger: log,
      find: async () => {
        throw new Error('boom');
      }
    } as unknown as Payload;

    await applyPlatformFaq(payload, [
      {
        topic: 'drafts',
        question: { en: 'Q', sv: 'F' },
        answer: { en: 'A', sv: 'S' }
      }
    ]);

    expect(rollbackTransaction).toHaveBeenCalledWith('t1');
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
