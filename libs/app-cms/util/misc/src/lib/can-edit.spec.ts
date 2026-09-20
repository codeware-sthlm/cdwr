import type { User, UserAny } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { canEdit, canEditIn } from './can-edit';
import { getUserTenantIDs } from './get-user-tenant-ids';

/** Minimal shape that satisfies `isUser` (needs `role` and `tenants`) */
const user = (
  role: User['role'],
  tenants: Array<{ tenant: number; role: 'reader' | 'user' | 'admin' }>
): UserAny => ({ id: 1, role, tenants }) as unknown as UserAny;

const reader = user('user', [{ tenant: 1, role: 'reader' }]);
const editor = user('user', [{ tenant: 1, role: 'user' }]);
const tenantAdmin = user('user', [{ tenant: 1, role: 'admin' }]);
/** Reader of tenant 1, editor of tenant 2 — the mixed-role case */
const mixed = user('user', [
  { tenant: 1, role: 'reader' },
  { tenant: 2, role: 'user' }
]);
/** System users administer the platform and need no membership at all */
const systemUser = user('system-user', []);

describe('canEdit', () => {
  it('is false for a reader-only user', () => {
    expect(canEdit(reader)).toBe(false);
  });

  it('is true for an editor and a tenant admin', () => {
    expect(canEdit(editor)).toBe(true);
    expect(canEdit(tenantAdmin)).toBe(true);
  });

  it('is true for a system user holding no memberships', () => {
    // Regression guard: deriving editorship purely from tenant rows would lock
    // system users out of everything, since they are not required to have any.
    expect(canEdit(systemUser)).toBe(true);
  });

  it('is false for nothing and for a tenant api key', () => {
    expect(canEdit(null)).toBe(false);
    expect(canEdit({ id: 1, apiKey: 'k' } as unknown as UserAny)).toBe(false);
  });
});

describe('canEditIn', () => {
  it('separates the workspaces of a mixed-role user', () => {
    // The hole this closes: membership alone would grant write on tenant 1.
    expect(canEditIn(mixed, 1)).toBe(false);
    expect(canEditIn(mixed, 2)).toBe(true);
  });

  it('is false for a workspace the user does not belong to', () => {
    expect(canEditIn(editor, 99)).toBe(false);
  });

  it('accepts a populated tenant as well as an id', () => {
    expect(canEditIn(editor, { id: 1 } as never)).toBe(true);
  });

  it('is false when no tenant is given, rather than defaulting open', () => {
    expect(canEditIn(editor, null)).toBe(false);
    expect(canEditIn(editor, undefined)).toBe(false);
  });

  it('is true for a system user in any workspace', () => {
    expect(canEditIn(systemUser, 99)).toBe(true);
  });
});

describe('getUserTenantIDs with a role set', () => {
  it('accepts a single role, as before', () => {
    expect(getUserTenantIDs(mixed, 'user')).toEqual([2]);
    expect(getUserTenantIDs(mixed, 'reader')).toEqual([1]);
  });

  it('accepts several roles', () => {
    expect(getUserTenantIDs(mixed, ['user', 'admin'])).toEqual([2]);
    expect(getUserTenantIDs(mixed, ['reader', 'user'])).toEqual([1, 2]);
  });

  it('returns every membership when no role is given', () => {
    expect(getUserTenantIDs(mixed)).toEqual([1, 2]);
  });

  it('returns nothing for an empty role set, rather than everything', () => {
    // A caller computing roles dynamically must not accidentally widen access.
    expect(getUserTenantIDs(mixed, [])).toEqual([]);
  });
});
