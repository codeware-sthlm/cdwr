import type { Where } from 'payload';

import type { PayloadRuntime } from '../payload-runtime.types';

/** Collections that can carry a `visibility` field */
const GATED_COLLECTIONS = ['pages', 'posts'] as const;

/**
 * Whether this tenant has any members-only content at all.
 *
 * Used to decide whether a site offers a sign-in at all. A tenant that has
 * never gated anything shows nothing, so the feature stays invisible on the
 * sites that do not use it — and there is no setting to drift out of step with
 * the content.
 *
 * **This deliberately bypasses access control.** The public site renders as the
 * tenant api key, which by design cannot see members-only documents — asking it
 * to count them would always answer zero, on exactly the sites that have some.
 * The tenant constraint is therefore re-applied by hand, the same way
 * `resolveDraftQuery` does for draft previews. What escapes is a single
 * boolean, "this site has a member area", which is precisely what the sign-in
 * link announces anyway.
 *
 * Drafts count. A tenant part-way through building their member area still
 * wants members able to sign in, and only counting published documents would
 * make the link vanish the moment the last one was unpublished.
 *
 * @param runtime - Payload runtime for the tenant being served
 * @returns `true` when at least one members-only document exists
 */
export async function hasMembersContent(
  runtime: PayloadRuntime
): Promise<boolean> {
  const { payload, tenantConfig } = runtime;

  // Without a tenant there is nothing to scope the count to, and an unscoped
  // count would answer for the whole platform
  if (!tenantConfig) {
    return false;
  }

  const where: Where = {
    and: [
      { tenant: { equals: tenantConfig.tenant.id } },
      { visibility: { equals: 'members' } }
    ]
  };

  for (const collection of GATED_COLLECTIONS) {
    try {
      const { totalDocs } = await payload.count({
        collection,
        where,
        overrideAccess: true
      });

      if (totalDocs > 0) {
        return true;
      }
    } catch {
      // A failed count must not take the footer down with it
      continue;
    }
  }

  return false;
}
