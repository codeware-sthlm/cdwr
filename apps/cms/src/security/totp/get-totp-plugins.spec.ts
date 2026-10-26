import type { Access, Config } from 'payload';
import { payloadTotp, totpAccess } from 'payload-totp';

import { getTotpPlugins, publicFileAccess } from './get-totp-plugins';

jest.mock('payload-totp', () => {
  const wrapped = jest.fn();
  return {
    payloadTotp: jest.fn(() => 'payload-totp-plugin'),
    totpAccess: jest.fn(() => wrapped),
    __wrapped: wrapped
  };
});
// The misc barrel reaches an ESM-only module that Jest cannot load
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({}));
jest.mock('./totp-enrolment.plugin', () => ({
  totpEnrolmentPlugin: jest.fn(() => 'enrolment-plugin')
}));

const totpAccessMock = jest.mocked(totpAccess);
const wrapped = (jest.requireMock('payload-totp') as { __wrapped: jest.Mock })
  .__wrapped;

type AccessArgs = Parameters<Access>[0];

const args = (user: unknown, isReadingStaticFile: boolean) =>
  ({ req: { user }, isReadingStaticFile }) as unknown as AccessArgs;

describe('publicFileAccess', () => {
  beforeEach(() => {
    totpAccessMock.mockClear();
    wrapped.mockReset().mockReturnValue('totp-result');
  });

  it.each([
    { inner: true, expected: true },
    { inner: false, expected: false },
    {
      inner: { _status: { equals: 'published' } },
      expected: { _status: { equals: 'published' } }
    }
  ])(
    'anonymous static file read returns the inner result $expected',
    async ({ inner, expected }) => {
      const innerAccess = jest.fn().mockResolvedValue(inner);

      const call = args(null, true);
      expect(await publicFileAccess(innerAccess)(call)).toEqual(expected);
      expect(innerAccess).toHaveBeenCalledWith(call);
      expect(totpAccessMock).not.toHaveBeenCalled();
    }
  );

  it('reads a static file as a visitor for a session owing its code', async () => {
    const innerAccess = jest.fn().mockResolvedValue(true);
    const pending = {
      id: 1,
      role: 'user',
      tenants: [{ tenant: 7, role: 'reader' }],
      _strategy: 'local-jwt',
      hasTotp: true
    };

    expect(await publicFileAccess(innerAccess)(args(pending, true))).toBe(true);
    expect(innerAccess.mock.calls[0][0].req.user).toBeNull();
    expect(totpAccessMock).not.toHaveBeenCalled();
  });

  it('refuses an anonymous static file read without an inner access', () => {
    expect(publicFileAccess(undefined)(args(undefined, true))).toBe(false);
    expect(totpAccessMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'a signed-in static file read', user: { id: 1 }, isStatic: true },
    { name: 'an anonymous non-file read', user: null, isStatic: false },
    { name: 'a signed-in non-file read', user: { id: 1 }, isStatic: false }
  ])('delegates $name to totpAccess', ({ user, isStatic }) => {
    const innerAccess = jest.fn();
    const call = args(user, isStatic);

    expect(publicFileAccess(innerAccess)(call)).toBe('totp-result');
    expect(totpAccessMock).toHaveBeenCalledWith(innerAccess);
    expect(wrapped).toHaveBeenCalledWith(call);
    expect(innerAccess).not.toHaveBeenCalled();
  });

  it('delegates without an inner access', () => {
    const call = args(null, false);

    publicFileAccess(undefined)(call);

    expect(totpAccessMock).toHaveBeenCalledWith(undefined);
    expect(wrapped).toHaveBeenCalledWith(call);
  });
});

describe('getTotpPlugins', () => {
  it('returns three plugins with payloadTotp last', () => {
    const plugins = getTotpPlugins();

    expect(plugins).toHaveLength(3);
    expect(plugins[1]).toBe('enrolment-plugin');
    expect(plugins[2]).toBe('payload-totp-plugin');
    expect(payloadTotp).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', forceSetup: false })
    );
  });

  it('makes media and stock-media skip the totp read wrapper', async () => {
    const [publicFiles] = getTotpPlugins();
    const read = jest.fn();
    const config = {
      collections: [
        { slug: 'media', access: { read, update: jest.fn() } },
        { slug: 'stock-media', access: {} },
        { slug: 'pages', access: { read } }
      ]
    } as unknown as Config;

    const result = await (publicFiles as (c: Config) => Config)(config);
    const [media, stock, pages] = result.collections as Array<{
      access: { read: unknown };
      custom?: unknown;
    }>;

    expect(media.access.read).not.toBe(read);
    expect(media.custom).toEqual({
      totp: { disableAccessWrapper: { read: true } }
    });
    expect(stock.custom).toEqual({
      totp: { disableAccessWrapper: { read: true } }
    });
    expect(pages.access.read).toBe(read);
    expect(pages.custom).toBeUndefined();
  });
});
