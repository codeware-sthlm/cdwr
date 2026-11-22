import type { Page } from '@codeware/shared/util/payload-types';
import {
  type BlocksData,
  listingCategoryIds
} from '@codeware/shared/util/payload-utils';

import { findPosts } from './find-posts';
import { findTours } from './find-tours';
import type { RequestBaseOptions } from './utils/types';

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
  layout: Page['layout'] | null | undefined,
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
 * Fetch all data required by the blocks in a page layout.
 *
 * Listing blocks (e.g. PostsBlock) query a collection dynamically and need a
 * separate fetch — those are resolved here and returned in `blocksData`,
 * keyed by block id.
 *
 * @param layout - The page layout blocks to resolve data for.
 * @param options - The base request options.
 * @returns Resolved blocks data.
 */
export const getBlocksData = async (
  layout: Page['layout'] | null | undefined,
  options: RequestBaseOptions
): Promise<BlocksData> => {
  const [posts, tours] = await Promise.all([
    resolveListingBlocks(layout, 'posts', ({ limit, categories }) => {
      const categoryIds = listingCategoryIds(categories);

      return findPosts({
        ...options,
        limit,
        ...(categoryIds.length > 0 && { categories: categoryIds })
      });
    }),
    resolveListingBlocks(layout, 'tours', ({ limit }) =>
      findTours({ ...options, limit })
    )
  ]);

  return {
    ...(posts && { posts }),
    ...(tours && { tours })
  };
};
