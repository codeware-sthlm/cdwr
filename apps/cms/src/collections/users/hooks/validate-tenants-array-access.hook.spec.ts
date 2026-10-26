import type { CollectionBeforeChangeHook } from 'payload';

import { validateTenantsArrayAccessHook } from './validate-tenants-array-access.hook';

// ESM-only, and not what is under test
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('payload', () => ({ APIError: Error }));
jest.mock('@codeware/app-cms/util/i18n', () => ({
  customT: () => (key: string) => key
}));

type Args = Parameters<CollectionBeforeChangeHook>[0];

const data = { tenants: [{ tenant: 7, role: 'admin' }] };

const run = (context: Record<string, unknown>) =>
  validateTenantsArrayAccessHook({
    context,
    data,
    operation: 'create',
    originalDoc: undefined,
    req: { t: jest.fn(), user: undefined }
  } as unknown as Args);

describe('validateTenantsArrayAccessHook', () => {
  it('refuses assigning a workspace without a logged in user', () => {
    expect(() => run({})).toThrow();
  });

  it('lets a seed create through', () => {
    expect(run({ seedAction: true })).toBe(data);
  });

  it('lets a signup create through', () => {
    expect(run({ signup: true })).toBe(data);
  });

  it('lets the idle cleanup through', () => {
    expect(run({ idleCleanup: true })).toBe(data);
  });

  it('leaves an update that does not touch the workspaces alone', () => {
    // payload-totp saves a secret this way; read as an empty list it would
    // look like every workspace being removed
    const partial = { totpSecret: 'secret' };
    expect(
      validateTenantsArrayAccessHook({
        context: {},
        data: partial,
        operation: 'update',
        originalDoc: { tenants: [{ id: 'row', tenant: 7, role: 'admin' }] },
        req: { t: jest.fn(), user: undefined }
      } as unknown as Args)
    ).toBe(partial);
  });
});
