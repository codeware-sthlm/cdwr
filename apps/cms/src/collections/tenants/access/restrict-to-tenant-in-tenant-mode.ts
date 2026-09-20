import { getTenantContext } from '@codeware/app-cms/data-access';
import { canEdit, canEditIn, isTenant } from '@codeware/app-cms/util/misc';
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

  // Check if we're in tenant mode, restricting to a single tenant
  const tenantContext = await getTenantContext();
  const tenant = tenantContext
    ? await findTenantByApiKey(payload, tenantContext.tenantApiKey)
    : null;

  // Editor *of the tenant being served*. `canEdit` alone is workspace-agnostic,
  // so someone who edits workspace B but only reads the deployed workspace A
  // would be handed A's tenant document — and with it A's api key.
  const mayEditHere = tenant ? canEditIn(user, tenant.id) : canEdit(user);

  // Refused with a constraint that matches nothing rather than a flat `false`.
  // The multi-tenant plugin fetches tenants while *rendering* the admin layout
  // (`getTenantOptions`), before Payload evaluates `access.admin`, so a flat
  // refusal makes that find throw and a reader who types /admin meets a 500.
  // An empty result denies just as completely and lets the panel give its own
  // "not allowed" answer.
  if (!mayEditHere) {
    return { id: { equals: 0 } };
  }

  // Restrict to this tenant only
  if (tenant) {
    return { id: { equals: tenant.id } };
  }

  // Host mode: the multi-tenant plugin scopes by the selected tenant
  return true;
};
