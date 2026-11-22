import type { Post } from '@codeware/shared/util/payload-types';

import { invokeRequest } from './utils/invoke-request';
import type { RequestBaseOptions } from './utils/types';

/**
 * Find posts sorted by creation date descending.
 *
 * @param options - The options to find posts with.
 * @param options.limit - Maximum number of posts to return.
 * @param options.depth - How deep relations are populated; the REST default when omitted.
 * @param options.categories - Category ids; when non-empty only posts in at least one of them are returned.
 * @returns The list of posts.
 * @throws A formatted error message when the request fails.
 */
export const findPosts = async (
  options: RequestBaseOptions & {
    limit?: number;
    depth?: number;
    categories?: Array<number>;
  }
): Promise<Array<Post>> => {
  const { limit, depth, categories, ...baseOptions } = options;

  const categoryFilter = (categories ?? []).map(
    (id, index) =>
      `where[categories][in][${index}]=${encodeURIComponent(String(id))}`
  );

  const response = await invokeRequest('posts', {
    ...baseOptions,
    method: 'GET',
    query: ['sort=-createdAt', ...categoryFilter].join('&'),
    limit,
    depth
  });

  if ('error' in response) {
    throw new Error(`Error fetching posts: ${response.error}`);
  }

  return (response.data as Array<Post>) ?? [];
};
