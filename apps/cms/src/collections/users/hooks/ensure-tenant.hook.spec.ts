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
});
