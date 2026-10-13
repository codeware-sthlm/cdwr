import { hashInviteSecret } from '@codeware/shared/util/invite-code';
import type { BasePayload } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InviteCodeRefused,
  checkInviteCode,
  consumeInviteCode
} from './invite-codes';

const CODE = 'ABCD-EFGH-JKMN-PQRS';
let attempt = 0;

const codeDoc = async (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  lookup: 'ABCDEFGH',
  codeHash: await hashInviteSecret('JKMNPQRS'),
  maxUses: 2,
  uses: 0,
  expiresAt: null,
  ...overrides
});

/** A payload whose finds answer from the given documents and whose update returns `rows` */
const fakePayload = (options: {
  open?: boolean;
  doc?: Record<string, unknown> | null;
  rows?: number;
  transaction?: boolean;
}) => {
  const execute = vi.fn().mockResolvedValue({
    rows: Array.from({ length: options.rows ?? 1 }, () => ({ id: 7 }))
  });
  const find = vi.fn(async ({ collection }: { collection: string }) =>
    collection === 'platform-settings'
      ? { docs: [{ signupOpen: options.open ?? true }] }
      : { docs: options.doc ? [options.doc] : [] }
  );
  const payload = {
    authenticatedUser: null,
    find,
    db: {
      execute,
      tables: {
        invite_codes: {
          id: 'id',
          uses: 'uses',
          maxUses: 'max_uses',
          expiresAt: 'expires_at',
          updatedAt: 'updated_at'
        }
      },
      sessions: options.transaction === false ? {} : { tx1: { db: {} } }
    }
  };
  return { payload: payload as unknown as BasePayload, execute, find };
};

beforeEach(() => {
  attempt += 1;
});

/** A fresh rate-limit key per test, since the limiter keeps its hits in memory */
const key = () => `test-${attempt}:invite-code`;

describe('checkInviteCode', () => {
  it('is closed while signup is off, before touching the code', async () => {
    const { payload, find } = fakePayload({ open: false });
    await expect(
      checkInviteCode(payload, CODE, { attemptsKey: key() })
    ).resolves.toBe('closed');
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid code', async () => {
    const { payload } = fakePayload({ doc: await codeDoc() });
    await expect(
      checkInviteCode(payload, CODE, { attemptsKey: key() })
    ).resolves.toBe('valid');
  });

  it.each([
    ['an unparseable code', 'nope'],
    ['a wrong secret', 'ABCD-EFGH-JKMN-PQRT']
  ])('calls %s unknown', async (_label, input) => {
    const { payload } = fakePayload({ doc: await codeDoc() });
    await expect(
      checkInviteCode(payload, input, { attemptsKey: key() })
    ).resolves.toBe('unknown');
  });

  it('calls a lookup with no code unknown', async () => {
    const { payload } = fakePayload({ doc: null });
    await expect(
      checkInviteCode(payload, CODE, { attemptsKey: key() })
    ).resolves.toBe('unknown');
  });

  it('tells expired and exhausted apart only for the right secret', async () => {
    const expired = fakePayload({
      doc: await codeDoc({ expiresAt: '2020-01-01T00:00:00.000Z' })
    });
    const exhausted = fakePayload({ doc: await codeDoc({ uses: 2 }) });
    await expect(
      checkInviteCode(expired.payload, CODE, { attemptsKey: key() })
    ).resolves.toBe('expired');
    await expect(
      checkInviteCode(exhausted.payload, CODE, { attemptsKey: key() })
    ).resolves.toBe('exhausted');
  });

  it('throttles after ten attempts, right ones included', async () => {
    const { payload } = fakePayload({ doc: await codeDoc() });
    const attemptsKey = key();
    for (let i = 0; i < 10; i += 1) {
      await checkInviteCode(payload, CODE, { attemptsKey });
    }
    await expect(checkInviteCode(payload, CODE, { attemptsKey })).resolves.toBe(
      'throttled'
    );
  });

  it('counts a burst of parallel guesses before any of them derives', async () => {
    const { payload } = fakePayload({ doc: await codeDoc() });
    const attemptsKey = key();
    const verdicts = await Promise.all(
      Array.from({ length: 25 }, () =>
        checkInviteCode(payload, 'ABCD-EFGH-JKMN-PQRT', { attemptsKey })
      )
    );
    expect(verdicts.filter((v) => v === 'unknown')).toHaveLength(10);
    expect(verdicts.filter((v) => v === 'throttled')).toHaveLength(15);
  });
});

describe('consumeInviteCode', () => {
  it('spends a use with one conditional update and returns the id', async () => {
    const { payload, execute } = fakePayload({ doc: await codeDoc() });
    await expect(
      consumeInviteCode(payload, CODE, {
        transactionID: 'tx1',
        attemptsKey: key()
      })
    ).resolves.toBe(7);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('refuses when the update touches no row, the last use already spent', async () => {
    const { payload } = fakePayload({ doc: await codeDoc(), rows: 0 });
    await expect(
      consumeInviteCode(payload, CODE, {
        transactionID: 'tx1',
        attemptsKey: key()
      })
    ).rejects.toEqual(new InviteCodeRefused('exhausted'));
  });

  it('refuses a wrong secret without updating anything', async () => {
    const { payload, execute } = fakePayload({ doc: await codeDoc() });
    await expect(
      consumeInviteCode(payload, 'ABCD-EFGH-JKMN-PQRT', {
        transactionID: 'tx1'
      })
    ).rejects.toEqual(new InviteCodeRefused('unknown'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses while signup is closed', async () => {
    const { payload } = fakePayload({ open: false, doc: await codeDoc() });
    await expect(
      consumeInviteCode(payload, CODE, {
        transactionID: 'tx1',
        attemptsKey: key()
      })
    ).rejects.toEqual(new InviteCodeRefused('closed'));
  });

  it('shares the throttle with the check', async () => {
    const { payload, execute } = fakePayload({ doc: await codeDoc() });
    const attemptsKey = key();
    for (let i = 0; i < 10; i += 1) {
      await checkInviteCode(payload, CODE, { attemptsKey });
    }
    await expect(
      consumeInviteCode(payload, CODE, { transactionID: 'tx1', attemptsKey })
    ).rejects.toEqual(new InviteCodeRefused('throttled'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses outside an open transaction', async () => {
    const { payload, execute } = fakePayload({
      doc: await codeDoc(),
      transaction: false
    });
    await expect(
      consumeInviteCode(payload, CODE, {
        transactionID: 'tx1',
        attemptsKey: key()
      })
    ).rejects.toThrow('open transaction');
    expect(execute).not.toHaveBeenCalled();
  });
});
