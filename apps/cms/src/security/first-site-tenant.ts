import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  canEdit,
  getUserTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { Payload, TypedUser } from 'payload';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

import { resolveScopedTenant } from './resolve-scoped-tenant';

/**
 * The workspace a first site would be applied to, when this user may do it.
 *
 * Shared by the guide's view and the endpoint that applies, so the two never
 * disagree. Resolved on the server, never taken from a request body. Only an
 * admin of that workspace qualifies; a system user applies sites from the CLI,
 * and a tenant API key is no person to build a site for.
 */
export async function firstSiteTenantId(
  payload: Payload,
  headers: Headers,
  user: TypedUser | null | undefined
): Promise<number | null> {
  if (!canEdit(user ?? null) || hasRole(user ?? null, 'system-user')) {
    return null;
  }

  const tenantId =
    getEnv().APP_MODE.type === 'tenant'
      ? ((await resolveScopedTenant(payload))?.id ?? null)
      : getSingleTenantIdFromHeaders(headers, user);

  if (tenantId === null) {
    return null;
  }

  return getUserTenantIDs(user ?? null, ['admin']).includes(tenantId)
    ? tenantId
    : null;
}
