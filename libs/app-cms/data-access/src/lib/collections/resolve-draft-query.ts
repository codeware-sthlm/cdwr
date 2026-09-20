import { isUser } from '@codeware/app-cms/util/misc';
import type { Where } from 'payload';

import type { PayloadRuntime } from '../payload-runtime.types';

type DraftQuery = {
  /** Whether Payload access control must be bypassed for this query. */
  overrideAccess: boolean;
  /** The provided `where` combined with the draft-mode tenant constraint. */
  where: Where | undefined;
};

/**
 * Resolve the access and scoping concerns shared by the draft-aware
 * collection functions (`getPage`, `getPages`, `getPost`, `getPosts`).
 *
 * - `overrideAccess` — access control is bypassed for unauthenticated fetches,
 *   and in draft mode for non-admin identities (the access function restricts
 *   API key clients to published documents, which draft previews must bypass).
 *   Authenticated admin users keep access control: they may read drafts
 *   already, and bypassing would leak other tenants' content in the admin UI.
 * - `where` — in draft mode an explicit tenant constraint is added to
 *   preserve tenant isolation, since `overrideAccess` also bypasses the
 *   tenant filter from the access control function. Outside draft mode a
 *   site render is narrowed to published documents, which is what keeps an
 *   editor's own site free of their drafts.
 */
export function resolveDraftQuery(
  runtime: PayloadRuntime,
  draft: boolean | undefined,
  where?: Where
): DraftQuery {
  const { payload, tenantConfig } = runtime;

  const overrideAccess =
    payload.authenticatedUser === null ||
    (draft === true && !isUser(payload.authenticatedUser));

  const tenantWhere: Where | undefined =
    draft && tenantConfig
      ? { tenant: { equals: tenantConfig.tenant.id } }
      : undefined;

  // The public site shows published content whoever is looking. Access control
  // exempts editors from the status filter so the admin can show drafts, which
  // would otherwise mean an editor browsing their own site saw unpublished
  // work the moment they signed in. A query constraint narrows, never widens,
  // so this cannot loosen anything access control decided.
  const publishedWhere: Where | undefined =
    payload.asVisitor && !draft
      ? {
          or: [
            { _status: { equals: 'published' } },
            { _status: { exists: false } }
          ]
        }
      : undefined;

  const constraints = [where, tenantWhere, publishedWhere].filter(
    (constraint): constraint is Where => Boolean(constraint)
  );

  const scopedWhere: Where | undefined =
    constraints.length === 0
      ? undefined
      : constraints.length === 1
        ? constraints[0]
        : { and: constraints };

  return { overrideAccess, where: scopedWhere };
}
