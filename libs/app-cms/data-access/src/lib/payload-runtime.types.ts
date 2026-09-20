import type {
  Tenant,
  TenantRuntimeConfig
} from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

/**
 * Authenticated Payload wrapper that includes the user context.
 * This type extends Payload with a convenience property to access the authenticated user.
 */
export type AuthenticatedPayload = Payload & {
  /**
   * The authenticated user for this request.
   * Use this user in all Local API calls to ensure proper access control.
   */
  authenticatedUser: Awaited<ReturnType<Payload['auth']>>['user'];

  /**
   * The tenant this request is being served for, or `null` outside tenant mode.
   *
   * Kept apart from `authenticatedUser` on purpose. A signed-in member of this
   * workspace authenticates *as themselves*, so gated content resolves against
   * their membership — which means the identity can no longer be relied on to
   * say which tenant is being served. Anything needing the tenant (site
   * configuration, theme, locale) reads it here.
   */
  tenant: Tenant | null;

  /**
   * Whether this runtime is rendering the public site.
   *
   * The site shows published content whoever is looking, so an editor browsing
   * their own site does not suddenly see unpublished work. Access control
   * cannot tell a site request from an admin one — this is how the read
   * helpers know.
   */
  asVisitor: boolean;
};

/**
 * Runtime context for Payload operations, including the authenticated Payload instance and tenant configuration.
 * This context is used in server-side operations to ensure that all Payload interactions are properly authenticated and scoped to the correct tenant.
 *
 * `tenantConfig` will be `null` if there is no tenant context or the configuration could not be loaded.
 */
export type PayloadRuntime = {
  payload: AuthenticatedPayload;
  tenantConfig: TenantRuntimeConfig | null;
};
