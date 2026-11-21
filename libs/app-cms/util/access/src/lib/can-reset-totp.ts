import {
  getId,
  getUserTenantIDs,
  hasRole,
  isUser
} from '@codeware/app-cms/util/misc';
import type { User, UserAny } from '@codeware/shared/util/payload-types';

/** The parts of the target user the rule reads; form data may lack any of them */
export type TotpResetTarget = Partial<Pick<User, 'id' | 'role' | 'tenants'>>;

/**
 * Whether `requester` may reset the two-factor login of `target`.
 *
 * - Nobody resets themself: a signed-in user removes their own entry with a code.
 * - A system user can reset anyone else.
 * - A workspace admin can reset a user who is not a system user and belongs
 *   only to workspaces where the requester is admin, the same rule as editing
 *   that user's workspaces.
 */
export const canResetTotp = (
  requester: UserAny | null | undefined,
  target: TotpResetTarget | null | undefined
): boolean => {
  const self = requester ?? null;
  if (!isUser(self) || target?.id === undefined || target.id === self.id) {
    return false;
  }
  if (hasRole(self, 'system-user')) {
    return true;
  }
  if (target.role !== 'user') {
    return false;
  }

  const targetTenantIds = (target.tenants ?? []).map((t) => getId(t.tenant));
  if (!targetTenantIds.length) {
    return false;
  }
  const adminTenantIds = getUserTenantIDs(self, 'admin');
  return targetTenantIds.every((id) => adminTenantIds.includes(id));
};
