import { headers } from 'next/headers';
import type { Payload, TypedUser } from 'payload';

import { firstSiteTenantId } from '../../../security/first-site-tenant';

export type FirstSiteState =
  | { kind: 'available'; tenantName: string }
  | { kind: 'has-pages' }
  | { kind: 'unavailable' };

/** Whether the signed-in user of an admin view is offered the guide */
export async function getFirstSiteState(
  payload: Payload,
  user: TypedUser | null | undefined
): Promise<FirstSiteState> {
  const tenantId = await firstSiteTenantId(payload, await headers(), user);
  if (tenantId === null) {
    return { kind: 'unavailable' };
  }

  // Drafts count too, as in the endpoint that does the applying
  const { totalDocs } = await payload.count({
    collection: 'pages',
    where: { tenant: { equals: tenantId } },
    overrideAccess: true
  });
  if (totalDocs > 0) {
    return { kind: 'has-pages' };
  }

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    depth: 0,
    select: { name: true },
    overrideAccess: true
  });

  return { kind: 'available', tenantName: tenant.name };
}
