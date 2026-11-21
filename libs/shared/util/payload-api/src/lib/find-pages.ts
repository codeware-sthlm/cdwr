import type { Page } from '@codeware/shared/util/payload-types';

import { invokeRequest } from './utils/invoke-request';
import type { RequestBaseOptions } from './utils/types';

/**
 * Find pages sorted by creation date descending.
 *
 * @param options - The options to find pages with.
 * @param options.limit - Maximum number of pages to return.
 * @param options.depth - How deep relations are populated; the REST default when omitted.
 * @returns The list of pages.
 * @throws A formatted error message when the request fails.
 */
export const findPages = async (
  options: RequestBaseOptions & { limit?: number; depth?: number }
): Promise<Array<Page>> => {
  const { limit, depth, ...baseOptions } = options;

  const response = await invokeRequest('pages', {
    ...baseOptions,
    method: 'GET',
    query: 'sort=-createdAt',
    limit,
    depth
  });

  if ('error' in response) {
    throw new Error(`Error fetching pages: ${response.error}`);
  }

  return (response.data as Array<Page>) ?? [];
};
