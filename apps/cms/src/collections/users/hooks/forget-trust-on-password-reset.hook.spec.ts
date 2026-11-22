/** @jest-environment node */
import { nextTrustEpoch } from '@codeware/app-cms/data-access';
import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeValidateHook } from 'payload';

import { forgetTrustOnPasswordResetHook } from './forget-trust-on-password-reset.hook';

// The draw itself is covered in data-access; the barrel is ESM-heavy
jest.mock('@codeware/app-cms/data-access', () => ({
  nextTrustEpoch: jest.fn()
}));

type HookArgs = Parameters<CollectionBeforeValidateHook<User>>[0];

const draw = jest.mocked(nextTrustEpoch);

const run = (
  operation: 'create' | 'update',
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>
) =>
  forgetTrustOnPasswordResetHook({
    data,
    operation,
    originalDoc,
    req: {}
  } as unknown as HookArgs);

describe('forgetTrustOnPasswordResetHook', () => {
  beforeEach(() => draw.mockReset().mockReturnValue(77));

  it.each([4, 0, null])(
    'gives the reset row a fresh epoch drawn from %s, in place',
    (from) => {
      const row = { id: 10, hash: 'new-hash', trustEpoch: from };

      run('update', row);

      // Payload writes the row it passed in and ignores the return value
      expect(row.trustEpoch).toBe(77);
      expect(draw).toHaveBeenCalledWith(from);
    }
  );

  it('leaves a regular update alone, which always has an originalDoc', () => {
    const data = { id: 10, hash: 'x', trustEpoch: 4 };

    run('update', data, { id: 10, trustEpoch: 4 });

    expect(data.trustEpoch).toBe(4);
    expect(draw).not.toHaveBeenCalled();
  });

  it('leaves an update without a new hash alone', () => {
    const data = { id: 10, trustEpoch: 4 };

    run('update', data);

    expect(data.trustEpoch).toBe(4);
    expect(draw).not.toHaveBeenCalled();
  });

  it('leaves a create alone', () => {
    const data = { hash: 'x' };

    run('create', data);

    expect(data).toEqual({ hash: 'x' });
    expect(draw).not.toHaveBeenCalled();
  });
});
