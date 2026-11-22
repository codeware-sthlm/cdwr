import type { Post } from '@codeware/shared/util/payload-types';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

import { listingCategoryIds } from './listing-category-ids';
import { resolveDraftQuery } from './resolve-draft-query';

/**
 * The path of the page that lists a post, found among the pages with a posts
 * block on it, so a post can link back to wherever the site lists it.
 *
 * A listing filtered on one of the post's categories comes first, then a
 * listing with no filter. A filtered listing that doesn't show the post is
 * never picked.
 *
 * Returns null when no page lists the post.
 *
 * @param runtime - Authenticated Payload runtime instance
 * @param post - The post to link back from
 * @returns A path such as `/devlog`, or null
 */
export async function getPostsListingPath(
  runtime: PayloadRuntime | BasePayload,
  post: Pick<Post, 'categories'>
): Promise<string | null> {
  const resolvedRuntime = mapToRuntime(runtime);
  const { payload, tenantConfig } = resolvedRuntime;

  const { overrideAccess, where } = resolveDraftQuery(resolvedRuntime, false, {
    'layout.blockType': { equals: 'posts' }
  });

  const result = await payload.find({
    collection: 'pages',
    where,
    select: { slug: true, layout: true },
    depth: 0,
    locale: tenantConfig?.locale,
    limit: 50,
    overrideAccess,
    user: payload.authenticatedUser,
    disableErrors: true
  });

  const postCategoryIds = new Set(listingCategoryIds(post.categories));
  let unfilteredSlug: string | null = null;

  for (const page of result.docs) {
    if (!page.slug) {
      continue;
    }
    for (const block of page.layout ?? []) {
      if (block.blockType !== 'posts') {
        continue;
      }
      const categoryIds = listingCategoryIds(block.categories);
      if (!categoryIds.length) {
        unfilteredSlug ??= page.slug;
      } else if (categoryIds.some((id) => postCategoryIds.has(id))) {
        return `/${page.slug}`;
      }
    }
  }

  return unfilteredSlug ? `/${unfilteredSlug}` : null;
}
