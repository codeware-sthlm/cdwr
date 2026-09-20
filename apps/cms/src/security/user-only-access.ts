import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { systemUserOrTenantAdminAccess } from '@codeware/app-cms/util/access';
import {
  canEdit,
  canEditIn,
  editorTenantRoles,
  getUserTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Access, Where } from 'payload';

import { resolveScopedTenant } from './resolve-scoped-tenant';

type Options = {
  /**
   * Restrict to system users and tenant admins.
   *
   * @default false
   */
  adminOnly?: boolean;

  /**
   * Document path holding the tenant relation.
   *
   * Version documents nest the document under `version`, so their constraint
   * has to target `version.tenant`.
   *
   * @default 'tenant'
   */
  tenantPath?: 'tenant' | 'version.tenant';
};

/**
 * Access control for tenant-enabled collections, for everything but client
 * reads — create, update, delete and version history.
 *
 * **Editor users only.** Tenant API key clients are read-only: the multi-tenant
 * plugin only constrains identities from the admin users collection, so an api
 * key that passes this control would reach every tenant's documents, not just
 * its own. Users holding only a `reader` role are refused for the same reason
 * they exist — they may read gated site content, never change it.
 *
 * In tenant mode the result is scoped to the active tenant and the user must
 * be an editor *of that tenant*, so a user with several memberships cannot
 * write outside the running deployment or into a workspace they only read. In
 * host mode the constraint is the set of tenants the user may edit; the
 * multi-tenant plugin adds its own membership constraint but ignores the role.
 *
 * **Note:** Payload ignores a query constraint on create. The tenant a new
 * document lands in is governed by the tenant field's own access control.
 *
 * @param options - Access restrictions to apply
 */
export const userOnlyAccess =
  ({ adminOnly = false, tenantPath = 'tenant' }: Options = {}): Access =>
  async (args) => {
    const {
      req: { payload, user }
    } = args;

    // Editor users only, which also rules out unauthenticated requests and
    // tenant api keys. A `reader` is an ordinary user with site access only,
    // so membership alone must never reach a write.
    if (!canEdit(user)) {
      return false;
    }

    const constraints: Array<Where> = [];

    if (adminOnly) {
      const result = systemUserOrTenantAdminAccess(args);
      if (!result) {
        return false;
      }
      if (typeof result === 'object') {
        constraints.push(result);
      }
    }

    const { APP_MODE } = getEnv();

    if (APP_MODE.type === 'tenant') {
      const tenant = await resolveScopedTenant(payload);

      // If we can't resolve a tenant, deny access to be safe (shouldn't happen in tenant mode)
      if (!tenant) {
        payload.logger.warn(
          '[userOnlyAccess] Could not resolve tenant for tenant-mode user, denying access'
        );
        return false;
      }

      // Editor of *this* tenant, not merely an editor somewhere: a user who
      // reads tenant A and edits tenant B must not write to A.
      if (!canEditIn(user, tenant.id)) {
        return false;
      }

      constraints.push({ [tenantPath]: { equals: tenant.id } });
    } else if (!hasRole(user, 'system-user')) {
      // Host mode. The multi-tenant plugin adds a membership constraint, but it
      // never looks at the role, so constrain to the tenants this user may edit.
      constraints.push({
        [tenantPath]: { in: getUserTenantIDs(user, editorTenantRoles) }
      });
    }

    if (!constraints.length) {
      return true;
    }

    return constraints.length === 1 ? constraints[0] : { and: constraints };
  };
