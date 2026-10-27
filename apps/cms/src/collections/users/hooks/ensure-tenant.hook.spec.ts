import type { CollectionBeforeValidateHook } from 'payload';

import { ensureTenantHook } from './ensure-tenant.hook';

// ESM-only, and not what is under test
jest.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({
  getTenantFromCookie: jest.fn()
}));
jest.mock('payload', () => ({
  ValidationError: class ValidationError extends Error {}
}));
jest.mock('@codeware/app-cms/util/i18n', () => ({
  customT: () => (key: string) => key
}));

type Args = Parameters<CollectionBeforeValidateHook>[0];

const run = (context: Record<string, unknown>) =>
  ensureTenantHook({
    collection: { slug: 'users' },
    context,
    data: { name: 'No workspace' },
    req: { t: jest.fn(), user: undefined }
  } as unknown as Args);

describe('ensureTenantHook', () => {
  it('refuses a user without a workspace and without a logged in user', () => {
    expect(() => run({})).toThrow();
  });

  it('lets a seed create through', () => {
    expect(run({ seedAction: true })).toEqual({ name: 'No workspace' });
  });

  it('lets a signup create through', () => {
    expect(run({ signup: true })).toEqual({ name: 'No workspace' });
  });

  // payload-totp saves `{ totpSecret }` with no request and no user; Payload has
  // filled the rest of `data` from the stored document by the time the hook runs
  const totpWrite = (stored: Record<string, unknown>) =>
    ensureTenantHook({
      collection: { slug: 'users' },
      context: {},
      data: { ...stored, totpSecret: 'secret' },
      operation: 'update',
      originalDoc: stored,
      req: { t: jest.fn(), user: undefined }
    } as unknown as Args);

  it('lets payload-totp save the secret of a system user', () => {
    expect(() =>
      totpWrite({ id: 1, role: 'system-user', tenants: [] })
    ).not.toThrow();
  });

  it('lets payload-totp save the secret of a workspace user', () => {
    expect(() =>
      totpWrite({
        id: 2,
        role: 'user',
        tenants: [{ id: 'row', tenant: 7, role: 'admin' }]
      })
    ).not.toThrow();
  });

  it('refuses an update that removes the last workspace', () => {
    expect(() =>
      ensureTenantHook({
        collection: { slug: 'users' },
        context: {},
        data: { id: 2, role: 'user', tenants: [] },
        operation: 'update',
        originalDoc: {
          id: 2,
          role: 'user',
          tenants: [{ id: 'row', tenant: 7, role: 'admin' }]
        },
        req: { t: jest.fn(), user: undefined }
      } as unknown as Args)
    ).toThrow();
  });

  it('refuses a workspace user who claims the system-user role to drop their workspaces', () => {
    // Field access discards the role change later, which would leave a user
    // with no workspace
    expect(() =>
      ensureTenantHook({
        collection: { slug: 'users' },
        context: {},
        data: { id: 2, role: 'system-user', tenants: [] },
        operation: 'update',
        originalDoc: {
          id: 2,
          role: 'user',
          tenants: [{ id: 'row', tenant: 7, role: 'admin' }]
        },
        req: { t: jest.fn(), user: { id: 2, role: 'user' } }
      } as unknown as Args)
    ).toThrow();
  });

  it('still refuses an update that empties the workspaces', () => {
    expect(() =>
      ensureTenantHook({
        collection: { slug: 'users' },
        context: {},
        data: { tenants: [] },
        operation: 'update',
        req: { t: jest.fn(), user: undefined }
      } as unknown as Args)
    ).toThrow();
  });
});
