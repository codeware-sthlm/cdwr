import { getTenantContext } from '@codeware/app-cms/data-access';
import { canEdit, isTenant } from '@codeware/app-cms/util/misc';
import type { User } from '@codeware/shared/util/payload-types';
import type { Access } from 'payload';

import { findTenantByApiKey } from '../../../security/find-tenant-by-api-key';

/**
 * Restrict access to the tenant matching the current deployment's API key in tenant mode.
 *
 * This will ensure that the multi-tenant plugin only allows access to the single tenant in tenant mode.
 * Otherwise the plugin would detect all tenants the user has access to.
 */
export const restrictToTenantInTenantMode: Access<User> = async ({
  data,
  req: { payload, user }
}) => {
  // This collection carries every tenant's api key, so it is closed to anyone
  // who is not an editor. The *shape* of the refusal differs by identity, and
  // both shapes matter:
  //
  // An api key or an anonymous caller is refused outright — 403 is the right
  // answer to an api request, and neither ever renders the admin panel.
  if (!user || isTenant(user)) {
    return false;
  }

  // A reader is refused with a constraint that matches nothing instead. The
  // multi-tenant plugin fetches tenants while *rendering* the admin layout
  // (`getTenantOptions`), before Payload evaluates `access.admin`, so a flat
  // refusal makes that find throw and a reader who types /admin meets a 500.
  // An empty result denies just as completely and lets the panel give its own
  // "not allowed" answer.
  if (!canEdit(user)) {
    return { id: { equals: 0 } };
  }

  // Check if we're in tenant mode, restricting to a single tenant
  const tenantContext = await getTenantContext();

  if (tenantContext) {
    // Fetch tenant ID from API key
    const tenant = await findTenantByApiKey(
      payload,
      tenantContext.tenantApiKey
    );
    // Restrict to this tenant only
    return {
      id: { equals: tenant?.id }
    };
  }

  // Authenticated, allow access
  return true;
};
