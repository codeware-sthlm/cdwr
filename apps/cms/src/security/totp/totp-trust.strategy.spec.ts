/**
 * @jest-environment node
 */
import type { AuthStrategyFunctionArgs } from 'payload';

import { totpTrustStrategy } from './totp-trust.strategy';
import { secretHash, signTrustToken } from './trust-token';

const secret = 'payload-secret';
const totpSecret = 'BASE32SECRET';

const passwordUser = {
  id: 5,
  collection: 'users',
  hasTotp: true,
  _strategy: 'local-jwt'
};

const setup = async ({
  claimsOverride = {},
  stored = { totpSecret, trustEpoch: 0 },
  sessionUser = passwordUser as Record<string, unknown> | null,
  withCookie = true
}: {
  claimsOverride?: Partial<{
    userId: number;
    secretHash: string;
    trustEpoch: number;
  }>;
  stored?: { totpSecret: string | null; trustEpoch: number | null };
  sessionUser?: Record<string, unknown> | null;
  withCookie?: boolean;
} = {}) => {
  const token = await signTrustToken(
    {
      userId: 5,
      secretHash: secretHash(totpSecret),
      trustEpoch: 0,
      ...claimsOverride
    },
    secret
  );
  const authenticate = jest.fn().mockResolvedValue({ user: sessionUser });
  const payload = {
    secret,
    config: { cookiePrefix: 'payload' },
    collections: { users: { config: { auth: { cookies: { secure: true } } } } },
    authStrategies: [{ name: 'local-jwt', authenticate }],
    findByID: jest.fn().mockResolvedValue(stored)
  };
  const headers = new Headers(
    withCookie ? { cookie: `a=b; payload-totp-trust=${token}` } : {}
  );
  const args = { headers, payload } as unknown as AuthStrategyFunctionArgs;
  return { result: await totpTrustStrategy.authenticate(args), authenticate };
};

describe('totpTrustStrategy', () => {
  it('verifies the same user with a matching secret and epoch', async () => {
    const { result } = await setup();
    expect(result.user).toMatchObject({ id: 5, _strategy: 'totp' });
  });

  it.each([
    ['another user', { sessionUser: { ...passwordUser, id: 6 } }],
    [
      'a user of another collection',
      {
        sessionUser: { ...passwordUser, collection: 'tenants' }
      }
    ],
    ['a changed secret', { stored: { totpSecret: 'OTHER', trustEpoch: 0 } }],
    ['a removed secret', { stored: { totpSecret: null, trustEpoch: 0 } }],
    ['a bumped epoch', { stored: { totpSecret, trustEpoch: 1 } }]
  ])('refuses %s and expires the trust cookie', async (_name, options) => {
    const { result } = await setup(options);
    expect(result.user).toBeNull();
    expect(result.responseHeaders?.get('set-cookie')).toMatch(
      /^payload-totp-trust=; Path=\/; .*Max-Age=0/
    );
  });

  it('leaves the cookie alone when there is only no password session', async () => {
    expect((await setup({ sessionUser: null })).result).toEqual({
      user: null
    });
  });

  it('expires a cookie that is not a valid token', async () => {
    const stale = await totpTrustStrategy.authenticate({
      headers: new Headers({ cookie: 'payload-totp-trust=garbage' }),
      payload: {
        secret,
        config: { cookiePrefix: 'payload' },
        collections: { users: { config: { auth: { cookies: {} } } } }
      }
    } as unknown as AuthStrategyFunctionArgs);
    expect(stale.responseHeaders?.get('set-cookie')).toContain('Max-Age=0');
  });

  it('accepts an epoch 0 token when the stored epoch is null', async () => {
    const { result } = await setup({
      stored: { totpSecret, trustEpoch: null }
    });
    expect(result.user).toMatchObject({ id: 5, _strategy: 'totp' });
  });

  it('refuses without the trust cookie, before asking for a session', async () => {
    const { result, authenticate } = await setup({ withCookie: false });
    expect(result).toEqual({ user: null });
    expect(authenticate).not.toHaveBeenCalled();
  });
});
