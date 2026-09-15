import type { SiteSetting } from '@codeware/shared/util/payload-types';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

import type { QuerySingleOptions } from './types';

/**
 * Fetch the full site settings document for an explicit tenant.
 *
 * {@link getGeneralSiteSettings} scopes by the caller's own identity — it queries
 * with no `where` at all, relying on access control to naturally return only
 * the tenant that identity can see. That fits a tenant-scoped API key or a
 * logged-in tenant user, where identity *is* the tenant, but not an admin
 * viewing one specific *other* tenant's document from inside an unrelated
 * edit view (a form, a tour): there, the right scope is "what tenant does
 * this document belong to", not "what can this identity see" — a
 * system-user's identity can see many tenants, and an unscoped query would
 * return whichever one happens to sort first.
 *
 * Still respects access control (`overrideAccess`/`user`) — this only adds
 * the explicit tenant filter identity-based scoping can't express.
 *
 * Returns null if no site settings exist for the tenant, or the current
 * user doesn't have access.
 *
 * @param runtime - Authenticated Payload runtime or BasePayload instance
 * @param tenantId - ID of the tenant whose site settings to fetch
 * @param options - Optional query options
 * @returns Site settings or null
 */
export async function getSiteSettingsForTenant(
  runtime: PayloadRuntime | BasePayload,
  tenantId: number,
  options: QuerySingleOptions = {}
): Promise<SiteSetting | null> {
  const { payload, tenantConfig } = mapToRuntime(runtime);
  const { depth = 0, locale } = options;
  const overrideAccess = payload.authenticatedUser === null;

  const { docs } = await payload.find({
    collection: 'site-settings',
    where: { tenant: { equals: tenantId } },
    depth,
    limit: 1,
    locale: locale ?? tenantConfig?.locale,
    overrideAccess,
    user: payload.authenticatedUser,
    disableErrors: true
  });

  return docs[0] ?? null;
}
