import type { Page } from '@codeware/shared/util/payload-types';
import {
  type BlocksData,
  listingCategoryIds
} from '@codeware/shared/util/payload-utils';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

import { getPage } from './get-page';
import { getPosts } from './get-posts';
import { getTours } from './get-tours';
import type { QuerySingleOptions } from './types';

export type PageData = {
  page: Page;
  blocksData: BlocksData;
};

type LayoutBlock = NonNullable<Page['layout']>[number];

/**
 * Resolve every listing block of one type into documents keyed by block id.
 *
 * Blocks without an id are skipped — the key is what pairs the fetched
 * documents with the block at render time.
 */
async function resolveListingBlocks<
  TType extends LayoutBlock['blockType'],
  TDoc
>(
  layout: Page['layout'] | undefined,
  blockType: TType,
  fetchDocs: (
    block: Extract<LayoutBlock, { blockType: TType }>
  ) => Promise<Array<TDoc>>
): Promise<Record<string, Array<TDoc>> | undefined> {
  const blocks = (layout ?? []).filter(
    (block): block is Extract<LayoutBlock, { blockType: TType }> =>
      block.blockType === blockType
  );

  if (!blocks.length) {
    return undefined;
  }

  const docsByBlock: Record<string, Array<TDoc>> = {};
  await Promise.all(
    blocks.map(async (block) => {
      if (!block.id) {
        return;
      }
      docsByBlock[block.id] = await fetchDocs(block);
    })
  );

  return docsByBlock;
}

/**
 * Fetch a page and all data required by its blocks in one call.
 *
 * `getPage` fetches the page structure. Blocks that use Payload relationship fields
 * have their data resolved automatically via `depth`. Listing blocks (e.g. PostsBlock)
 * query a collection dynamically and need a separate fetch — those are resolved here
 * and returned in `blocksData`, keyed by block id.
 *
 * Apps should call this instead of `getPage` directly so no data-fetching logic
 * leaks into route files.
 *
 * @param runtime - Authenticated Payload runtime or default Payload instance
 * @param slugOrId - Slug or ID of the page to fetch
 * @param options - Optional query options
 * @returns PageData or null if the page is not found
 */
export async function getPageData(
  runtime: PayloadRuntime | BasePayload,
  slugOrId: number | string,
  options: QuerySingleOptions = {}
): Promise<PageData | null> {
  const resolvedRuntime = mapToRuntime(runtime);

  const page = await getPage(resolvedRuntime, slugOrId, options);
  if (!page) {
    return null;
  }

  const [posts, tours] = await Promise.all([
    resolveListingBlocks(
      page.layout,
      'posts',
      async ({ categories, limit }) => {
        const categoryIds = listingCategoryIds(categories);
        const result = await getPosts(resolvedRuntime, {
          limit,
          sort: '-createdAt' as 'createdAt',
          ...(categoryIds.length > 0 && {
            where: { categories: { in: categoryIds } }
          })
        });
        return result?.docs ?? [];
      }
    ),
    resolveListingBlocks(page.layout, 'tours', async ({ limit }) => {
      const result = await getTours(resolvedRuntime, {
        limit,
        sort: '-createdAt' as 'createdAt'
      });
      return result?.docs ?? [];
    })
  ]);

  const blocksData: BlocksData = {
    ...(posts && { posts }),
    ...(tours && { tours })
  };

  return { page, blocksData };
}
