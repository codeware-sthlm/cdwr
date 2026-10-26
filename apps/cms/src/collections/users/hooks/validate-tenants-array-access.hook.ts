import { customT } from '@codeware/app-cms/util/i18n';
import { getId, getUserTenantIDs, hasRole } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import { APIError, type CollectionBeforeChangeHook } from 'payload';

/**
 * Hook to validate that users can only modify workspace assignments
 * for workspaces they manage.
 *
 * - On create: ensures all assigned tenants are ones the requesting user admins.
 * - On update: compares original document tenants with incoming changes and blocks
 *   modifications to tenants where the user is not an admin.
 */
export const validateTenantsArrayAccessHook: CollectionBeforeChangeHook<
  User
> = ({ context, data, req: { t, user }, operation, originalDoc }) => {
  if ((operation !== 'create' && operation !== 'update') || !data) {
    return data;
  }
  // Nothing to check when the update does not touch the workspaces, as when
  // payload-totp saves a secret with no request; read as an empty list it
  // would look like every workspace being removed
  if (operation === 'update' && data.tenants === undefined) {
    return data;
  }

  // System users, seed operations, signups and the idle cleanup can modify anything
  if (
    hasRole(user, 'system-user') ||
    context?.seedAction ||
    context?.signup ||
    context?.statsAccountWrite ||
    context?.idleCleanup
  ) {
    return data;
  }

  // Get tenants the current user administers
  const userAdminTenantIds = getUserTenantIDs(user, 'admin');

  // On create: all assigned tenants must be ones the admin manages
  if (operation === 'create') {
    const newTenants = data.tenants || [];
    for (const newTenant of newTenants) {
      const tenantId = getId(newTenant.tenant);
      if (tenantId && !userAdminTenantIds.includes(tenantId)) {
        throw new APIError(
          customT(t)('authentication:cannotAssignToWorkspace'),
          400
        );
      }
    }
    return data;
  }

  // Get original and new tenant assignments (originalDoc is always present on update)
  const originalTenants = originalDoc?.tenants || [];
  const newTenants = data.tenants || [];

  // Check each tenant in the new data
  for (let i = 0; i < newTenants.length; i++) {
    const newTenant = newTenants[i];
    const originalTenant = originalTenants.find(
      (tenant) => tenant.id === newTenant.id
    );

    const newTenantId = getId(newTenant.tenant);

    if (!newTenantId) {
      continue;
    }

    // Check if user can admin this tenant
    const canAdminTenant = userAdminTenantIds.includes(newTenantId);

    if (!canAdminTenant) {
      // If this is a new tenant row or modified tenant row, block it
      if (!originalTenant || getId(originalTenant.tenant) !== newTenantId) {
        throw new APIError(
          customT(t)('authentication:cannotAssignToWorkspace'),
          400
        );
      }

      // If role changed for a tenant user doesn't admin, revert it
      if (originalTenant.role !== newTenant.role) {
        newTenant.role = originalTenant.role;
      }
    }
  }

  // Check for removed tenants - user can only remove tenants they admin
  const removedTenants = originalTenants.filter(
    (orig) => !newTenants.find((nt) => nt.id === orig.id)
  );

  for (const removed of removedTenants) {
    const removedTenantId = getId(removed.tenant);
    if (removedTenantId && !userAdminTenantIds.includes(removedTenantId)) {
      throw new APIError(
        customT(t)('authentication:cannotRemoveFromWorkspace'),
        400
      );
    }
  }

  return data;
};
