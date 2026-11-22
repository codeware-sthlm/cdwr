import type { BasePayload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { forgetTotpTrust } from './forget-totp-trust';

const setup = (trustEpoch: number | null | undefined) => {
  const findByID = vi.fn().mockResolvedValue({ id: 10, trustEpoch });
  const update = vi.fn().mockResolvedValue({});
  const payload = { findByID, update } as unknown as BasePayload;
  return { payload, findByID, update };
};

describe('forgetTotpTrust', () => {
  it.each([
    { from: 0, to: 1 },
    { from: 4, to: 5 },
    { from: null, to: 1 },
    { from: undefined, to: 1 }
  ])('raises the epoch from $from to $to', async ({ from, to }) => {
    const { payload, update } = setup(from);

    await expect(forgetTotpTrust(payload, { id: 10 })).resolves.toBe(to);

    expect(update).toHaveBeenCalledWith({
      collection: 'users',
      id: 10,
      data: { trustEpoch: to },
      depth: 0,
      overrideAccess: true
    });
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
