import { customT } from '@codeware/app-cms/util/i18n';
import { getUserTenantIDs, hasRole } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionAfterLoginHook } from 'payload';

import { resolveScopedTenant } from '../../../security/resolve-scoped-tenant';

/**
 * This hook is only applicable when CMS is running in **tenant mode**.
 *
 * Verifies that the user has access to the scoped tenant, which is meant to restrict
 * cross-tenant logins. This is mainly a UX improvement and not required for security reasons.
 *
 * This hook runs after login authentication but before the session is created.
 *
 * - System users bypass this check
 * - Users without tenants bypass this check
 *
 * @throws Error with 403 status if user doesn't have access to the scoped tenant
 */
export const verifyTenantModeAccessHook: CollectionAfterLoginHook<
  User
> = async ({ req: { headers, payload, t }, user }) => {
  // If scoped tenant can't be resolved, allow access without checks
  const tenant = await resolveScopedTenant(payload);
  if (!tenant) {
    return user;
  }

  // Skip check for system users - they can access from any anywhere
  if (hasRole(user, 'system-user')) {
    return user;
  }

  // Skip check for users without tenants (shouldn't happen, but safe fallback)
  if (!user.tenants?.length) {
    return user;
  }

  // Check if current user has access to the scoped tenant
  const isAllowed = getUserTenantIDs(user).includes(tenant.id);

  if (!isAllowed) {
    payload.logger.warn(
      `[verifyTenantModeAccess] User '${user.id}' attempted login from unauthorized tenant '${tenant.slug}'`
    );

    // Throw error with 403 status
    const error: Error & { status?: number } = new Error(
      customT(t)('authentication:crossTenantDenied')
    );
    error.status = 403;
    throw error;
  }

  // Access granted
  payload.logger.info(
    `[verifyTenantModeAccess] User '${user.id}' authorized to access tenant '${tenant.slug}'`
  );

  return user;
};
