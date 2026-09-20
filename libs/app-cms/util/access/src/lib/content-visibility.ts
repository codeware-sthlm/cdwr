import { canEdit, getUserTenantIDs, isUser } from '@codeware/app-cms/util/misc';
import type { Tenant, UserAny } from '@codeware/shared/util/payload-types';
import type { Where } from 'payload';

/** Value of the `visibility` field that anyone may read */
const PUBLIC = 'public';

/**
 * Documents anyone may read.
 *
 * A missing value counts as public: the field is required going forward and the
 * migration backfills it, so `null` can only mean a document predating the
 * field — and nothing was restricted before it existed. Treating `null` as
 * restricted would instead hide a whole site if a backfill were ever missed.
 */
export const publicVisibilityWhere: Where = {
  or: [{ visibility: { equals: PUBLIC } }, { visibility: { exists: false } }]
};

/**
 * The single rule for who may read members-only content.
 *
 * Returns `null` when the identity may read everything in scope, or a `Where`
 * narrowing to public documents when it may not. Callers combine the result
 * with their own tenant scoping — note Payload **ANDs** an access result with
 * the incoming query (`combineQueries`), so a query can only ever narrow this
 * further, never widen it. That is why this lives in access control and not in
 * a data-access helper.
 *
 * Only two identities read everything: an editor, and a member of the tenant
 * whose content is being read. Everything else — the tenant api key the public
 * site runs as, a signed-in member of a *different* workspace, an unauthenticated
 * visitor — sees public documents only.
 *
 * @param identity - The authenticated identity, or `null` when there is none.
 * @param tenant - The tenant whose content is being read, or its id.
 * @returns `null` for unrestricted, otherwise the narrowing constraint.
 */
export const contentVisibilityWhere = (
  identity: UserAny | null | undefined,
  tenant: Tenant | Tenant['id'] | null | undefined
): Where | null => {
  if (!identity || !isUser(identity)) {
    // Includes the tenant api key, which belongs to no workspace
    return publicVisibilityWhere;
  }

  // An editor sees their own drafts and everything else besides
  if (canEdit(identity)) {
    return null;
  }

  if (tenant === null || tenant === undefined) {
    return publicVisibilityWhere;
  }

  const tenantId = typeof tenant === 'object' ? tenant.id : tenant;
  const isMember = getUserTenantIDs(identity).includes(tenantId);

  return isMember ? null : publicVisibilityWhere;
};
