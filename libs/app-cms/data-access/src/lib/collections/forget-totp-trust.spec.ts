import { randomInt } from 'node:crypto';

import type { BasePayload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

// The real draw, so a single spec can force a collision
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

import { forgetTotpTrust, nextTrustEpoch } from './forget-totp-trust';

describe('nextTrustEpoch', () => {
  it.each([0, 4, null, undefined])(
    'draws a positive epoch other than %s',
    (from) => {
      const next = nextTrustEpoch(from);

      expect(next).not.toBe(from ?? 0);
      expect(Number.isInteger(next) && next > 0).toBe(true);
    }
  );

  it('draws again when it lands on the current epoch', () => {
    vi.mocked(randomInt).mockReturnValueOnce(7).mockReturnValueOnce(9);

    expect(nextTrustEpoch(7)).toBe(9);
  });
});

const setup = (trustEpoch: number | null | undefined) => {
  const findByID = vi.fn().mockResolvedValue({ id: 10, trustEpoch });
  const update = vi.fn().mockResolvedValue({});
  const payload = { findByID, update } as unknown as BasePayload;
  return { payload, findByID, update };
};

describe('forgetTotpTrust', () => {
  it.each([0, 4, null, undefined])(
    'writes a fresh epoch other than %s',
    async (from) => {
      const { payload, update } = setup(from);

      const next = await forgetTotpTrust(payload, { id: 10 });

      expect(next).not.toBe(from ?? 0);
      expect(Number.isInteger(next) && next > 0).toBe(true);
      expect(update).toHaveBeenCalledWith({
        collection: 'users',
        id: 10,
        data: { trustEpoch: next },
        depth: 0,
        overrideAccess: true
      });
    }
  );

  it('two forgets in a row end on different epochs', async () => {
    const first = setup(0);
    const a = await forgetTotpTrust(first.payload, { id: 10 });
    const second = setup(a);
    const b = await forgetTotpTrust(second.payload, { id: 10 });

    expect(b).not.toBe(a);
  });

  it('reads the hidden epoch with access overridden', async () => {
    const { payload, findByID } = setup(0);

    await forgetTotpTrust(payload, { id: 10 });

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        overrideAccess: true,
        showHiddenFields: true
      })
    );
  });

  it('passes an update failure on', async () => {
    const { payload, update } = setup(0);
    update.mockRejectedValue(new Error('db down'));

    await expect(forgetTotpTrust(payload, { id: 10 })).rejects.toThrow(
      'db down'
    );
  });
});
