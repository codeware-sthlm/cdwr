import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../resolve-scoped-tenant';

import { resolveTotpIssuer } from './totp-issuer';

// The email and misc barrels reach modules Jest cannot load
jest.mock('@payloadcms/email-nodemailer', () => ({}));
jest.mock('nodemailer', () => ({}));
jest.mock('@sentry/nextjs', () => ({}));
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({}));
jest.mock('@codeware/app-cms/data-access', () => ({
  getSiteSettingsForTenant: jest.fn()
}));
jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('../resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));

const fetchSettings = jest.mocked(getSiteSettingsForTenant);
const env = jest.mocked(getEnv);
const scopedTenant = jest.mocked(resolveScopedTenant);

const settings = (general: Record<string, unknown>) =>
  ({ general }) as unknown as NonNullable<
    Awaited<ReturnType<typeof fetchSettings>>
  >;

const svgIcon = { source: 'svg', svgCode: '<svg/>' };

const mode = (type: 'host' | 'tenant') =>
  env.mockReturnValue({ APP_MODE: { type } } as unknown as ReturnType<
    typeof getEnv
  >);

const request = (user: unknown = null) => {
  const warn = jest.fn();
  const req = {
    user,
    payload: {
      logger: { warn },
      config: { serverURL: 'https://titan.example/' }
    }
  } as unknown as PayloadRequest;
  return { req, warn };
};

const member = (...tenants: Array<number | { id: number }>) => ({
  id: 1,
  role: 'user',
  tenants: tenants.map((tenant) => ({ tenant, role: 'admin' }))
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('resolveTotpIssuer', () => {
  describe('tenant mode', () => {
    beforeEach(() => {
      mode('tenant');
      scopedTenant.mockResolvedValue({ id: 7 } as never);
    });

    it("names the entry after the app's tenant, with its icon", async () => {
      fetchSettings.mockResolvedValue(
        settings({ appName: 'Titan Tours', icon: svgIcon })
      );

      expect(await resolveTotpIssuer(request(member(7)).req)).toEqual({
        issuer: 'Titan Tours',
        image: 'https://titan.example/site-icon.png?size=64'
      });
      expect(fetchSettings).toHaveBeenCalledWith(expect.anything(), 7);
    });

    it.each([
      { name: 'no icon', icon: undefined },
      { name: 'an uploaded icon', icon: { source: 'upload' } },
      { name: 'an empty svg', icon: { source: 'svg', svgCode: '  ' } }
    ])('leaves the image out for $name', async ({ icon }) => {
      fetchSettings.mockResolvedValue(settings({ appName: 'Titan', icon }));

      expect(await resolveTotpIssuer(request(member(7)).req)).toEqual({
        issuer: 'Titan'
      });
    });

    it('falls back without a tenant', async () => {
      scopedTenant.mockResolvedValue(undefined);

      expect(await resolveTotpIssuer(request(member(7)).req)).toEqual({
        issuer: 'cdwr'
      });
      expect(fetchSettings).not.toHaveBeenCalled();
    });

    // One entry signs them in everywhere, so it can't carry this site's name
    it.each([
      { name: "several tenants, the app's among them", user: member(7, 8) },
      { name: "one tenant that isn't the app's", user: member(8) },
      { name: 'a system user', user: { id: 1, role: 'system-user' } },
      { name: 'no user', user: null }
    ])('keeps the platform name for $name', async ({ user }) => {
      expect(await resolveTotpIssuer(request(user).req)).toEqual({
        issuer: 'cdwr'
      });
      expect(fetchSettings).not.toHaveBeenCalled();
    });
  });

  describe('host mode', () => {
    beforeEach(() => mode('host'));

    it.each([
      { name: 'a tenant id', tenant: 7 },
      { name: 'a populated tenant', tenant: { id: 7 } }
    ])(
      "names the entry after a user's only tenant, given $name",
      async ({ tenant }) => {
        fetchSettings.mockResolvedValue(
          settings({ appName: 'Titan Tours', icon: svgIcon })
        );

        // The host's /site-icon.png is not the tenant's, so no image
        expect(await resolveTotpIssuer(request(member(tenant)).req)).toEqual({
          issuer: 'Titan Tours'
        });
        expect(fetchSettings).toHaveBeenCalledWith(expect.anything(), 7);
        expect(scopedTenant).not.toHaveBeenCalled();
      }
    );

    it('skips a membership whose tenant is gone', async () => {
      fetchSettings.mockResolvedValue(settings({ appName: 'Titan Tours' }));
      const user = {
        ...member(7),
        tenants: [
          { tenant: null, role: 'user' },
          { tenant: 7, role: 'admin' }
        ]
      };

      expect(await resolveTotpIssuer(request(user).req)).toEqual({
        issuer: 'Titan Tours'
      });
    });

    it.each([
      { name: 'several tenants', user: member(7, 8) },
      { name: 'a system user', user: { id: 1, role: 'system-user' } },
      { name: 'no user', user: null }
    ])('keeps the platform name for $name', async ({ user }) => {
      expect(await resolveTotpIssuer(request(user).req)).toEqual({
        issuer: 'cdwr'
      });
      expect(fetchSettings).not.toHaveBeenCalled();
    });
  });

  it.each([
    { name: 'no settings', value: null },
    { name: 'no app name', value: settings({}) },
    { name: 'a blank app name', value: settings({ appName: ' : ' }) }
  ])('falls back for $name', async ({ value }) => {
    mode('host');
    fetchSettings.mockResolvedValue(value);

    expect(await resolveTotpIssuer(request(member(7)).req)).toEqual({
      issuer: 'cdwr'
    });
  });

  it('takes the colons out of the name', async () => {
    mode('host');
    fetchSettings.mockResolvedValue(settings({ appName: ' Titan: Tours ' }));

    expect(await resolveTotpIssuer(request(member(7)).req)).toEqual({
      issuer: 'Titan Tours'
    });
  });

  it('falls back and warns when the settings cannot be read', async () => {
    mode('tenant');
    scopedTenant.mockRejectedValue(new Error('db down'));
    const { req, warn } = request(member(7));

    expect(await resolveTotpIssuer(req)).toEqual({
      issuer: 'cdwr'
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });
});
