import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { contentVisibilityWhere } from '@codeware/app-cms/util/access';
import {
  canEdit,
  canEditIn,
  editorTenantRoles,
  getUserTenantIDs,
  hasRole,
  isUser
} from '@codeware/app-cms/util/misc';
import { verifySignature } from '@codeware/shared/util/signature';
import type { Access, Where } from 'payload';

import { setSentryTenantTag } from '../utils/set-sentry-tenant-tag';

import { resolveScopedTenant } from './resolve-scoped-tenant';

/**
 * Published documents, plus legacy ones created before versioning was enabled.
 */
const publishedOrLegacy: Where = {
  or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }]
};

type Options = {
  /**
   * Set for draft-enabled collections to restrict api key clients to published
   * documents only.
   */
  hasStatus?: boolean;

  /**
   * Set for collections carrying a `visibility` field, to hide members-only
   * documents from identities that are not a member.
   *
   * Only pass this where the field exists — Payload raises
   * "Cannot find field for path" for a constraint on a field a collection
   * does not have.
   */
  hasVisibility?: boolean;
};

/**
 * Read access control for tenant-enabled collections.
 *
 * Unauthenticated requests are always denied. Authenticated behavior differs
 * by identity type:
 *
 * **Editor users**
 *
 * - Tenant mode: scoped to the active tenant so users with multi-tenant
 *   memberships only see content for the running deployment. Combined with the
 *   multi-tenant plugin's own constraint, results are narrowed to the active
 *   tenant only. The tenant is resolved from `APP_MODE.apiKey` (or seed data
 *   in development).
 * - Host mode: unrestricted — the multi-tenant plugin handles scoping via the
 *   `payload-tenant` cookie.
 *
 * Editor users are never restricted by draft status. They see all documents
 * regardless of `_status` so the admin panel can show drafts freely.
 *
 * **Reader users**
 *
 * Scoped to the workspaces they belong to, and to published documents when
 * `hasStatus` is set. A reader exists to read gated site content, so it must not
 * inherit the unrestricted admin view that an editor gets.
 *
 * **Tenant (API key) clients**
 *
 * Always scoped to the tenant. When `hasStatus` is `true` (draft-enabled
 * collections), results are further filtered to `_status = 'published'` or
 * documents without a status (legacy documents created before versioning was
 * enabled). This prevents clients from inadvertently reading draft content.
 *
 * With `hasVisibility`, results are also filtered to public documents. This is
 * the control that keeps members-only content off the public site: the site
 * renders through the tenant api key, which belongs to no workspace.
 *
 * In host mode, external REST requests are additionally verified with a
 * request signature. Internal Local API calls (no `host` header) skip
 * verification — they run in-process and cannot be spoofed.
 *
 * @param options - `true` is shorthand for `{ hasStatus: true }`.
 */
export const userOrApiKeyAccess =
  (options: boolean | Options = false): Access =>
  async (args) => {
    // `true` is still accepted for the common draft-enabled case
    const { hasStatus = false, hasVisibility = false } =
      typeof options === 'boolean' ? { hasStatus: options } : options;

    const {
      req: { headers, payload, user }
    } = args;

    // Restrict to authenticated users only
    if (!user) {
      return false;
    }

    const { APP_MODE } = getEnv();

    // Allow access to admin panel for normal users, scoped to active tenant in tenant mode.
    if (isUser(user)) {
      // A reader is not an admin-panel identity: scope to the workspaces they
      // belong to and to published documents, the same way an api key client is
      // treated. Without this they would inherit the unrestricted admin view,
      // drafts included.
      const activeTenant =
        APP_MODE.type === 'tenant' ? await resolveScopedTenant(payload) : null;

      if (APP_MODE.type === 'tenant' && !activeTenant) {
        // If we can't resolve a tenant, deny access to be safe (shouldn't happen in tenant mode)
        payload.logger.warn(
          '[userOrApiKeyAccess] Could not resolve tenant for tenant-mode user, denying access'
        );
        return false;
      }

      // Editor *of the tenant being served*, not merely an editor somewhere.
      // A user who edits workspace B and only reads workspace A must not get
      // A's drafts and gated content, which the unrestricted branch grants.
      const mayEditHere = activeTenant
        ? canEditIn(user, activeTenant.id)
        : canEdit(user);

      if (!mayEditHere) {
        let tenantIds = getUserTenantIDs(user);

        if (activeTenant) {
          tenantIds = tenantIds.filter((id) => id === activeTenant.id);
        }

        if (!tenantIds.length) {
          return false;
        }

        const readerConstraints: Array<Where> = [{ tenant: { in: tenantIds } }];

        if (hasStatus) {
          readerConstraints.push(publishedOrLegacy);
        }

        if (hasVisibility) {
          // One tenant in scope means membership is decided; several (host
          // mode) cannot be expressed in a single constraint, so fall back to
          // public only rather than guess.
          const visibility = contentVisibilityWhere(
            user,
            tenantIds.length === 1 ? tenantIds[0] : null
          );
          if (visibility) {
            readerConstraints.push(visibility);
          }
        }

        return readerConstraints.length === 1
          ? readerConstraints[0]
          : { and: readerConstraints };
      }

      // Ensure the authenticated user docs are also scoped to the resolved tenant.
      // No restrictions on draft/published status - the admin UI should be able to read all docs in the active tenant.
      if (activeTenant) {
        return { tenant: { equals: activeTenant.id } };
      }

      // Host mode. The multi-tenant plugin scopes by the selected tenant, but
      // by membership rather than role, so a workspace this user only reads
      // would come with the unrestricted view attached.
      if (hasRole(user, 'system-user')) {
        return true;
      }

      return { tenant: { in: getUserTenantIDs(user, editorTenantRoles) } };
    }

    // The identity is the tenant itself, so its slug attributes any error raised
    // while serving this request — the only tenant signal a host deployment has.
    if ('slug' in user && typeof user.slug === 'string') {
      setSentryTenantTag(user.slug);
    }

    // cms host mode
    if (APP_MODE.type === 'host') {
      // Detect if this is an external REST API request vs internal Local API operation
      const isExternalRequest = headers.has('host');

      // Only verify signature for external REST API requests
      if (isExternalRequest) {
        const { success, error } = verifySignature({
          headers,
          secret: APP_MODE.signatureSecrets
        });

        if (!success) {
          payload.logger.info(`Tenant denied, invalid signature:\n${error}`);
          return false;
        }
      }
      // Internal Local API operations (no 'host' header) skip signature verification
    }

    // Restrict access to the tenant scope
    const constraints: Array<Where> = [{ tenant: { equals: user.id } }];

    // For draft-enabled collections: clients only see published docs or legacy null-status docs
    if (hasStatus) {
      constraints.push(publishedOrLegacy);
    }

    // The public site renders through this identity, so this is what keeps
    // members-only content off it. Without this filter a restricted page would
    // be served to anyone — the tenant key is not a member of anything.
    if (hasVisibility) {
      const visibility = contentVisibilityWhere(user, user.id);
      if (visibility) {
        constraints.push(visibility);
      }
    }

    return constraints.length === 1 ? constraints[0] : { and: constraints };
  };
