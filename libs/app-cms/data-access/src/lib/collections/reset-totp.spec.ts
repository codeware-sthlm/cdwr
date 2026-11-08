import type { BasePayload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { resetTotp } from './reset-totp';

describe('resetTotp', () => {
  it('clears the secret and every session with access overridden and no request', async () => {
    const update = vi.fn().mockResolvedValue({});
    const payload = { update } as unknown as BasePayload;

    await resetTotp(payload, { id: 10 });

    expect(update).toHaveBeenCalledWith({
      collection: 'users',
      id: 10,
      data: { totpSecret: null, sessions: [] },
      depth: 0,
      overrideAccess: true
    });
  });

  it('passes an update failure on', async () => {
    const payload = {
      update: vi.fn().mockRejectedValue(new Error('db down'))
    } as unknown as BasePayload;

    await expect(resetTotp(payload, { id: 10 })).rejects.toThrow('db down');
  });
});
