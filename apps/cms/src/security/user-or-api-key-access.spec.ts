/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { verifySignature } from '@codeware/shared/util/signature';
import type { AccessArgs } from 'payload';

import { resolveScopedTenant } from './resolve-scoped-tenant';
import { userOrApiKeyAccess } from './user-or-api-key-access';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
// The misc barrel reaches this ESM-only module, which Jest cannot load
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('./resolve-scoped-tenant', () => ({
  resolveScopedTenant: jest.fn()
}));
jest.mock('@codeware/shared/util/signature', () => ({
  verifySignature: jest.fn()
}));
jest.mock('../utils/set-sentry-tenant-tag', () => ({
  setSentryTenantTag: jest.fn()
}));

const agent = { id: 3, collection: 'agents', tenant: 7 };
const tenantKey = { id: 7, collection: 'tenants', slug: 'moon' };

const mode = (type: 'host' | 'tenant') =>
  jest.mocked(getEnv).mockReturnValue({
    APP_MODE:
      type === 'host'
        ? { type, signatureSecrets: ['secret'] }
        : { type, apiKey: 'key' }
  } as unknown as ReturnType<typeof getEnv>);

const args = (user: unknown, headers: Record<string, string> = {}) =>
  ({
    req: {
      user,
      headers: new Headers(headers),
      payload: { logger: { info: jest.fn(), warn: jest.fn() } }
    }
  }) as unknown as AccessArgs;

describe('userOrApiKeyAccess', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(resolveScopedTenant).mockResolvedValue({ id: 7 } as never);
  });

  describe.each(['host', 'tenant'] as const)('in %s mode', (type) => {
    beforeEach(() => {
      mode(type);
    });

    it.each([
      ['without hasStatus', false],
      ['with hasStatus', true]
    ])('refuses an agent %s', async (_name, hasStatus) => {
      await expect(
        userOrApiKeyAccess({ hasStatus })(args(agent))
      ).resolves.toBe(false);
    });
  });

  describe('for a tenant key in host mode', () => {
    beforeEach(() => {
      mode('host');
    });

    it('scopes a Local API call to its tenant without a signature', async () => {
      await expect(userOrApiKeyAccess()(args(tenantKey))).resolves.toEqual({
        tenant: { equals: 7 }
      });
      expect(verifySignature).not.toHaveBeenCalled();
    });

    it('refuses an external request with a bad signature', async () => {
      jest
        .mocked(verifySignature)
        .mockReturnValue({ success: false, error: 'bad' } as never);

      await expect(
        userOrApiKeyAccess()(args(tenantKey, { host: 'cms.test' }))
      ).resolves.toBe(false);
    });
  });
});
