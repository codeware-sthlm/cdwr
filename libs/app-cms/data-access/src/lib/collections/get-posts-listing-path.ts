import type { Post } from '@codeware/shared/util/payload-types';
import { listingCategoryIds } from '@codeware/shared/util/payload-utils';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

import { resolveDraftQuery } from './resolve-draft-query';

/** A page with a posts block, and the categories that block is filtered on. */
export type PostsListing = {
  path: string;
  categoryIds: Array<number>;
};

/**
 * The posts listings of the site: one entry per posts block, in page order,
 * oldest page first. Fetched apart from the post, so a post page can run
 * both queries at once and pick with `postsListingPath`.
 *
 * @param runtime - Authenticated Payload runtime instance
 * @returns The listings, empty when no page has a posts block
 */
export async function getPostsListings(
  runtime: PayloadRuntime | BasePayload
): Promise<Array<PostsListing>> {
  const resolvedRuntime = mapToRuntime(runtime);
  const { payload, tenantConfig } = resolvedRuntime;

  const { overrideAccess, where } = resolveDraftQuery(resolvedRuntime, false, {
    'layout.blockType': { equals: 'posts' }
  });

  const result = await payload.find({
    collection: 'pages',
    where,
    // Only the posts blocks' filter, not the rest of each layout
    select: { slug: true, layout: { posts: { categories: true } } },
    depth: 0,
    locale: tenantConfig?.locale,
    // Every listing, since the one that shows the post can be on any page
    pagination: false,
    sort: 'createdAt',
    overrideAccess,
    user: payload.authenticatedUser,
    disableErrors: true
  });

  return result.docs.flatMap((page) =>
    page.slug
      ? (page.layout ?? []).flatMap((block) =>
          block.blockType === 'posts'
            ? [
                {
                  path: `/${page.slug}`,
                  categoryIds: listingCategoryIds(block.categories)
                }
              ]
            : []
        )
      : []
  );
}

/**
 * The path of the listing a post links back to.
 *
 * A listing filtered on one of the post's categories comes first, then a
 * listing with no filter. A listing filtered only on categories the post
 * isn't in is never picked. The block's limit is not considered, so an older
 * post may link to a listing that shows only the newest posts of its category.
 *
 * @param listings - The site's listings, from `getPostsListings`
 * @param post - The post to link back from
 * @returns A path such as `/devlog`, or null when no listing fits
 */
export function postsListingPath(
  listings: Array<PostsListing>,
  post: Pick<Post, 'categories'>
): string | null {
  const postCategoryIds = new Set(listingCategoryIds(post.categories));

  const filtered = listings.find(({ categoryIds }) =>
    categoryIds.some((id) => postCategoryIds.has(id))
  );
  const unfiltered = listings.find(({ categoryIds }) => !categoryIds.length);

  return (filtered ?? unfiltered)?.path ?? null;
}

/**
 * The path of the page that lists a post. See `postsListingPath`.
 *
 * @param runtime - Authenticated Payload runtime instance
 * @param post - The post to link back from
 * @returns A path such as `/devlog`, or null
 */
export async function getPostsListingPath(
  runtime: PayloadRuntime | BasePayload,
  post: Pick<Post, 'categories'>
): Promise<string | null> {
  return postsListingPath(await getPostsListings(runtime), post);
}
