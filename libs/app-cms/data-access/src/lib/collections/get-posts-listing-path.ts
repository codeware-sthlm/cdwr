import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

import { resolveDraftQuery } from './resolve-draft-query';

/**
 * The path of the page that lists the posts, found as a page with a posts
 * block on it, so a post can link back to wherever the site keeps its list.
 *
 * Returns null when no page lists them.
 *
 * @param runtime - Authenticated Payload runtime instance
 * @returns A path such as `/devlog`, or null
 */
export async function getPostsListingPath(
  runtime: PayloadRuntime | BasePayload
): Promise<string | null> {
  const resolvedRuntime = mapToRuntime(runtime);
  const { payload, tenantConfig } = resolvedRuntime;

  const { overrideAccess, where } = resolveDraftQuery(resolvedRuntime, false, {
    'layout.blockType': { equals: 'posts' }
  });

  const result = await payload.find({
    collection: 'pages',
    where,
    select: { slug: true },
    depth: 0,
    locale: tenantConfig?.locale,
    limit: 1,
    overrideAccess,
    user: payload.authenticatedUser,
    disableErrors: true
  });

  const slug = result.docs[0]?.slug;
  return slug ? `/${slug}` : null;
}
