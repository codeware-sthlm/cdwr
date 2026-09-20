import type {
  Tenant,
  TenantRole,
  User,
  UserAny
} from '@codeware/shared/util/payload-types';
import type { TypeWithID } from 'payload';

import { getId } from './get-id';
import { getUserTenantIDs } from './get-user-tenant-ids';
import { hasRole } from './has-role';

/**
 * Tenant roles that may change things. A `reader` may not.
 */
export const editorTenantRoles: ReadonlyArray<TenantRole> = ['user', 'admin'];

/**
 * Can this identity change anything, in any workspace?
 *
 * A **capability**, not a role: it answers yes for a workspace `user` or
 * `admin`, and also for a platform `system-user`, who administers everything
 * and is not required to hold a workspace membership at all. Do not read it as
 * "has the editor role".
 *
 * Reach for this instead of `isUser` wherever the question is "may this
 * identity write, export or manage". `isUser` is true for a reader too —
 * readers are ordinary users carrying a `reader` workspace role — so it answers
 * a different question. This narrows the same way, so it drops straight in.
 *
 * @param user - The user to check.
 * @returns True when the user may edit somewhere.
 */
export const canEdit = <T extends TypeWithID = UserAny>(
  user: T | User | null
): user is User => {
  const candidate = user as UserAny | null;
  return (
    hasRole(candidate, 'system-user') ||
    getUserTenantIDs(candidate, editorTenantRoles).length > 0
  );
};

/**
 * Can this identity change anything **in this particular workspace**?
 *
 * The narrower question, and the one that matters when a user edits one
 * workspace and only reads another. A `system-user` answers yes everywhere.
 *
 * @param user - The user to check.
 * @param tenant - The tenant, or its id, to check the user against.
 * @returns True when the user has an editor role in that workspace.
 */
export const canEditIn = <T extends TypeWithID = UserAny>(
  user: T | User | null,
  tenant: Tenant | Tenant['id'] | null | undefined
): user is User => {
  const candidate = user as UserAny | null;
  if (hasRole(candidate, 'system-user')) {
    return true;
  }
  if (tenant === null || tenant === undefined) {
    return false;
  }
  return getUserTenantIDs(candidate, editorTenantRoles).includes(getId(tenant));
};
