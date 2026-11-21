import { getUserTenantIDs, hasRole } from '@codeware/app-cms/util/misc';
import type { Payload, TypedUser } from 'payload';

import { getSingleTenantId } from '../utils/tenant-where';

/**
 * Whether the viewer's own site still awaits activation.
 *
 * System users manage pending sites rather than wait on one, so they never
 * see the notice.
 */
export async function isSitePending(
  payload: Payload,
  user: TypedUser | null | undefined
): Promise<boolean> {
  if (hasRole(user ?? null, 'system-user')) {
    return false;
  }

  // The selected-workspace cookie can name a workspace the viewer is not in,
  // or one that no longer exists
  const tenantId = await getSingleTenantId(user);
  if (tenantId === null || !getUserTenantIDs(user ?? null).includes(tenantId)) {
    return false;
  }

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    depth: 0,
    select: { status: true },
    overrideAccess: true,
    disableErrors: true
  });
  return tenant?.status === 'pending';
}
