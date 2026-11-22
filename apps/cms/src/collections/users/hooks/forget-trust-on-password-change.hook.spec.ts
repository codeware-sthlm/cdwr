/** @jest-environment node */
import { nextTrustEpoch } from '@codeware/app-cms/data-access';
import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionBeforeChangeHook } from 'payload';

import { forgetTrustOnPasswordChangeHook } from './forget-trust-on-password-change.hook';

// The draw itself is covered in data-access; the barrel is ESM-heavy
jest.mock('@codeware/app-cms/data-access', () => ({
  nextTrustEpoch: jest.fn()
}));

type HookArgs = Parameters<CollectionBeforeChangeHook<User>>[0];

const draw = jest.mocked(nextTrustEpoch);

const run = (
  operation: 'create' | 'update',
  data: Record<string, unknown>,
  trustEpoch: number | null = 4
) =>
  forgetTrustOnPasswordChangeHook({
    data,
    operation,
    originalDoc: operation === 'update' ? { id: 10, trustEpoch } : undefined,
    req: {}
  } as unknown as HookArgs) as Record<string, unknown>;

describe('forgetTrustOnPasswordChangeHook', () => {
  beforeEach(() => draw.mockReset().mockReturnValue(77));

  it.each([4, 0, null])(
    'gives an update with a new password a fresh epoch drawn from %s',
    (from) => {
      expect(run('update', { password: 'a new password' }, from)).toEqual({
        password: 'a new password',
        trustEpoch: 77
      });
      expect(draw).toHaveBeenCalledWith(from);
    }
  );

  it.each([
    ['without a password', { name: 'Ada' }],
    ['with an empty password', { password: '' }]
  ])('leaves an update %s alone', (_, data) => {
    expect(run('update', data)).toEqual(data);
    expect(draw).not.toHaveBeenCalled();
  });

  it('leaves a create alone', () => {
    expect(run('create', { password: 'a new password' })).toEqual({
      password: 'a new password'
    });
    expect(draw).not.toHaveBeenCalled();
  });

  it('leaves the forget itself alone, so it cannot loop', () => {
    expect(run('update', { trustEpoch: 99 })).toEqual({ trustEpoch: 99 });
    expect(draw).not.toHaveBeenCalled();
  });
});
