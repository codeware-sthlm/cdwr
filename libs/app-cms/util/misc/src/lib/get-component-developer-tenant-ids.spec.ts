import type { User, UserAny } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { getComponentDeveloperTenantIDs } from './get-component-developer-tenant-ids';

type Row = {
  tenant: number | { id: number };
  role: 'reader' | 'user' | 'admin';
  componentDeveloper?: boolean;
};

const user = (role: User['role'], tenants: Array<Row>): UserAny =>
  ({ id: 1, role, tenants }) as unknown as UserAny;

describe('getComponentDeveloperTenantIDs', () => {
  it('returns the tenants where the flag is set', () => {
    const developer = user('user', [
      { tenant: 1, role: 'user', componentDeveloper: true },
      { tenant: 2, role: 'user', componentDeveloper: false },
      { tenant: 3, role: 'admin' }
    ]);
    expect(getComponentDeveloperTenantIDs(developer)).toEqual([1]);
  });

  it('never counts a reader, even with the flag set', () => {
    const reader = user('user', [
      { tenant: 1, role: 'reader', componentDeveloper: true }
    ]);
    expect(getComponentDeveloperTenantIDs(reader)).toEqual([]);
  });

  it('accepts a populated tenant', () => {
    const developer = user('user', [
      { tenant: { id: 5 }, role: 'admin', componentDeveloper: true }
    ]);
    expect(getComponentDeveloperTenantIDs(developer)).toEqual([5]);
  });

  it('gives nothing for a system user without memberships', () => {
    expect(getComponentDeveloperTenantIDs(user('system-user', []))).toEqual([]);
  });

  it('gives nothing for null and for a tenant api key', () => {
    expect(getComponentDeveloperTenantIDs(null)).toEqual([]);
    expect(
      getComponentDeveloperTenantIDs({
        id: 1,
        apiKey: 'k'
      } as unknown as UserAny)
    ).toEqual([]);
  });
});
