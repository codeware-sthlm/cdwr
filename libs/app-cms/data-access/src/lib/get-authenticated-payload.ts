import { getUserTenantIDs, isUser } from '@codeware/app-cms/util/misc';
import type { Tenant } from '@codeware/shared/util/payload-types';
import { headers } from 'next/headers';
import { type SanitizedConfig, getPayload } from 'payload';

import { getTenantContext } from './get-tenant-context';
import { AuthenticatedPayload } from './payload-runtime.types';

/**
 * A request-scoped view of the shared Payload instance.
 *
 * `getPayload` hands back a process-wide singleton, so writing the identity
 * onto it lets one request read another's — and now that the identity can be a
 * signed-in *member*, a concurrent anonymous request would be served their
 * gated content. It also collides within a single request: on `/login` the
 * layout resolves with `asVisitor` and the page without it.
 *
 * The prototype-linked view shadows the three properties while delegating
 * everything else, the same way `mapToRuntime` does.
 */
const asRuntime = (
  payload: Awaited<ReturnType<typeof getPayload>>,
  identity: {
    authenticatedUser: AuthenticatedPayload['authenticatedUser'];
    tenant: Tenant | null;
    asVisitor: boolean;
  }
): AuthenticatedPayload => Object.assign(Object.create(payload), identity);

export type AuthenticatedPayloadOptions = {
  /**
   * Authenticate as the signed-in visitor when they are a member of this
   * tenant, so access control can resolve gated content against their
   * membership.
   *
   * Off by default, which keeps the tenant api key — the identity every write
   * path and its hooks are built around. Turn it on for the **site render**
   * path only. Forgetting it hides gated content; turning it on for a write
   * path breaks the write.
   *
   * @default false
   */
  asVisitor?: boolean;
};

/**
 * Get an authenticated Payload instance for the current request.
 *
 * This function is designed for use on site/front-end pages only.
 * Admin pages are handled by Payload's built-in UI and do not use this function.
 *
 * Authentication strategy, in tenant mode:
 * - With `asVisitor`, a signed-in **member of this tenant** authenticates as
 *   themselves, so access control can resolve gated content against their
 *   membership.
 * - Everyone else — no session, a session belonging to another workspace, or
 *   any caller that did not ask — gets the tenant API key, exactly as before.
 *   An anonymous request is therefore unchanged.
 *
 * Outside tenant mode the built-in session authentication applies (if a session
 * cookie is present, e.g. from logging in to the admin UI).
 *
 * `authenticatedUser` is the identity access control runs as. `tenant` is the
 * tenant being served, which is **not** derivable from the identity once a
 * member can be that identity — read it for configuration, theme and locale.
 *
 * @returns Authenticated Payload instance with user and tenant context
 */
export async function getAuthenticatedPayload(
  payloadConfig: SanitizedConfig,
  { asVisitor = false }: AuthenticatedPayloadOptions = {}
): Promise<AuthenticatedPayload> {
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await headers();

  // Check if we have tenant context for API key authentication
  const tenantContext = await getTenantContext();

  if (tenantContext) {
    // Use tenant API key authentication
    // This ensures content is scoped to the correct tenant
    const authHeaders = new Headers();
    authHeaders.set(
      'Authorization',
      `tenants API-Key ${tenantContext.tenantApiKey}`
    );

    const tenantResult = await payload.auth({ headers: authHeaders });

    if (tenantResult.user) {
      // The api key authenticates as the tenant document itself, so the tenant
      // being served is already in hand — no second lookup needed.
      const tenant = tenantResult.user as unknown as Tenant;

      if (asVisitor) {
        const sessionUser = (await payload.auth({ headers: headersList })).user;

        // Any member of *this* workspace takes over the identity, editors
        // included — a board member who also edits still reads the member
        // area. A member of another workspace is no different from a stranger.
        //
        // An editor identity carries no `_status` filter in access control, so
        // `asVisitor` on the runtime is what keeps drafts off the public site.
        if (
          sessionUser &&
          isUser(sessionUser) &&
          getUserTenantIDs(sessionUser).includes(tenant.id)
        ) {
          return asRuntime(payload, {
            authenticatedUser: sessionUser,
            tenant,
            asVisitor
          });
        }
      }

      return asRuntime(payload, {
        authenticatedUser: tenantResult.user,
        tenant,
        asVisitor
      });
    }
  }

  // Fallback to admin session (host mode or unauthenticated)
  const authResult = await payload.auth({ headers: headersList });
  return asRuntime(payload, {
    authenticatedUser: authResult.user,
    tenant: null,
    asVisitor
  });
}
