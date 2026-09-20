import type {
  Tenant,
  TenantRole,
  UserAny
} from '@codeware/shared/util/payload-types';

import { getId } from './get-id';
import { isUser } from './is-user';

/**
 * Get the tenant IDs the user has access to.
 *
 * Note that membership says nothing about capability on its own — a `reader`
 * row grants site access only. Use {@link canEditIn} when the question is
 * whether the user may change something.
 *
 * @param user - The user to get the tenant IDs for.
 * @param limitToRole - Role or roles to limit the access to (defaults to all roles).
 * @returns The tenant IDs the user has access to.
 */
export const getUserTenantIDs = (
  user: UserAny | null,
  limitToRole?: TenantRole | ReadonlyArray<TenantRole>
): Array<Tenant['id']> => {
  if (!isUser(user)) {
    return [];
  }

  const roles =
    limitToRole === undefined
      ? undefined
      : Array.isArray(limitToRole)
        ? limitToRole
        : [limitToRole as TenantRole];

  return (
    user.tenants?.reduce(
      (acc, { role, tenant }) => {
        if (tenant) {
          if (!roles || roles.includes(role)) {
            acc.push(getId(tenant));
          }
        }
        return acc;
      },
      [] as Array<Tenant['id']>
    ) || []
  );
};
