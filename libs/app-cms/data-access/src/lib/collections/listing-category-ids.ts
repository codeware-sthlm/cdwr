import { getId } from '@codeware/app-cms/util/misc';
import type { Category } from '@codeware/shared/util/payload-types';

/**
 * The ids of the categories a posts listing is filtered on, or a post is in.
 *
 * Relations may be ids or populated documents, depending on the query depth.
 * An empty result means a listing with no filter, which lists every post.
 *
 * @param categories - The `categories` relation of a posts block or a post
 * @returns The category ids
 */
export const listingCategoryIds = (
  categories: Array<number | Category> | null | undefined
): Array<number> =>
  (categories ?? []).map((category) => getId(category)).filter(Boolean);
