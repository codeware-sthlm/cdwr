import {
  canEdit,
  getId,
  getUserTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import type { Access } from 'payload';

/**
 * This access control ensures that only users with admin access
 * to all tenants in current document has access.
 *
 * System users always have access.
 *
 * @param selfRule - Optionally force allow or deny access to the user themselves.
 */
export const adminAccessToAllDocTenants =
  (selfRule?: 'allowSelf' | 'denySelf'): Access<User> =>
  ({ data, id, req: { user } }) => {
    if (!canEdit(user)) {
      return false;
    }

    // System users always have access
    if (hasRole(user, 'system-user')) {
      return true;
    }

    // Self-rule check: use the document `id` from access args (populated for all
    // by-ID operations including DELETE where `data` is undefined), falling back
    // to `data.id` for cases where the client includes it in the request body.
    const docId = id ?? data?.id;
    if (selfRule && docId !== undefined && docId === user.id) {
      return selfRule === 'allowSelf';
    }

    // Allow list access (no data at all — e.g. a bulk operation without body)
    if (!data) {
      return true;
    }

    // Allow basic field updates when tenants key is absent from the request body —
    // the requester is not changing memberships so no admin check is needed.
    if (!('tenants' in data)) {
      return true;
    }

    const userAdminTenantIds = getUserTenantIDs(user, 'admin');

    // Clearing all memberships requires admin access to at least one tenant
    if (data.tenants?.length === 0) {
      return userAdminTenantIds.length > 0;
    }

    // Users have access to other users if they have admin access to all of the users tenants
    return (
      data.tenants?.every((t) =>
        userAdminTenantIds.includes(getId(t.tenant))
      ) ?? false
    );
  };
