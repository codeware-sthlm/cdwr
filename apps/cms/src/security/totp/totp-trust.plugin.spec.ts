/**
 * @jest-environment node
 */
import type { Config, PayloadRequest } from 'payload';

import { totpTrustAfterVerify, totpTrustPlugin } from './totp-trust.plugin';
import { setTrustCookie } from './trust-cookie';
import { secretHash, verifyTrustToken } from './trust-token';

jest.mock('./trust-cookie', () => ({ setTrustCookie: jest.fn() }));

const secret = 'payload-secret';
const collectionAuth = { cookies: { secure: true } };

const run = async (
  body: Record<string, unknown>,
  logger = { error: jest.fn() }
) => {
  const req = {
    payload: {
      logger,
      secret,
      collections: { users: { config: { auth: collectionAuth } } },
      findByID: jest
        .fn()
        .mockResolvedValue({ totpSecret: 'BASE32', trustEpoch: 2 })
    }
  } as unknown as PayloadRequest;
  const user = { id: 5, hasTotp: true } as Parameters<
    typeof totpTrustAfterVerify
  >[0]['user'];
  return totpTrustAfterVerify({ body, req, user });
};

describe('totpTrustAfterVerify', () => {
  beforeEach(() => jest.mocked(setTrustCookie).mockClear());

  it.each([{}, { trust: false }, { trust: 'false' }, { trust: 1 }])(
    'sets no cookie for %j',
    async (body) => {
      await run(body);
      expect(setTrustCookie).not.toHaveBeenCalled();
    }
  );

  it.each([true, 'true'])(
    'sets a cookie bound to the secret and epoch for trust=%j',
    async (trust) => {
      await run({ trust });
      expect(setTrustCookie).toHaveBeenCalledTimes(1);
      const { token, collectionAuth: auth } =
        jest.mocked(setTrustCookie).mock.calls[0][0];
      expect(auth).toBe(collectionAuth);
      expect(await verifyTrustToken(token, secret)).toEqual({
        userId: 5,
        secretHash: secretHash('BASE32'),
        trustEpoch: 2
      });
    }
  );
});

describe('totpTrustAfterVerify failures', () => {
  it('logs instead of throwing when the cookie cannot be set', async () => {
    const logger = { error: jest.fn() };
    jest.mocked(setTrustCookie).mockRejectedValueOnce(new Error('no cookies'));
    await expect(run({ trust: true }, logger)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('totpTrustPlugin', () => {
  const config = (strategies: Array<{ name: string }>) =>
    ({
      collections: [{ slug: 'pages' }, { slug: 'users', auth: { strategies } }]
    }) as unknown as Config;

  it('inserts its strategy right after totp', async () => {
    const result = await totpTrustPlugin(
      config([{ name: 'totp' }, { name: 'api-key' }])
    );
    const users = result.collections?.[1];
    expect(
      typeof users?.auth === 'object' &&
        users.auth.strategies?.map((s) => s.name)
    ).toEqual(['totp', 'totp-trust', 'api-key']);
  });

  it('throws when the plugin it follows is missing', () => {
    expect(() => totpTrustPlugin(config([{ name: 'api-key' }]))).toThrow(
      /after payloadTotp/
    );
  });
});
