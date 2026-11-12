import type { UserAny } from '@codeware/shared/util/payload-types';

import { isAgent } from './is-agent';

const as = (user: object) => user as unknown as UserAny;

describe('isAgent', () => {
  it('is true for an identity from the agents collection', () => {
    expect(isAgent(as({ id: 3, collection: 'agents', tenant: 7 }))).toBe(true);
  });

  it('is false for a user, a tenant, nothing, or a document without its collection', () => {
    expect(isAgent(as({ id: 1, collection: 'users', role: 'user' }))).toBe(
      false
    );
    expect(isAgent(as({ id: 7, collection: 'tenants', slug: 'moon' }))).toBe(
      false
    );
    expect(isAgent(null)).toBe(false);
    expect(isAgent(as({ id: 3, apiKey: 'k' }))).toBe(false);
  });
});
