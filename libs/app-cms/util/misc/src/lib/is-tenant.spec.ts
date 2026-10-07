import type { UserAny } from '@codeware/shared/util/payload-types';

import { isTenant } from './is-tenant';

const as = (user: object) => user as unknown as UserAny;

describe('isTenant', () => {
  it('is true for an identity from the tenants collection', () => {
    expect(isTenant(as({ id: 7, collection: 'tenants', slug: 'moon' }))).toBe(
      true
    );
  });

  it('is false for a user, nothing, or a document without its collection', () => {
    expect(isTenant(as({ id: 1, collection: 'users', role: 'user' }))).toBe(
      false
    );
    expect(isTenant(null)).toBe(false);
    // Payload strips `apiKey` from what it returns, so it can't identify a tenant
    expect(isTenant(as({ id: 7, apiKey: 'k' }))).toBe(false);
  });
});
