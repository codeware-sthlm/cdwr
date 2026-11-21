import type {
  CollectionSlug,
  CollectionWithoutPayload
} from '@codeware/shared/util/payload-types';

import { invokeRequest } from './utils/invoke-request';
import type { RequestBaseOptions } from './utils/types';

/**
 * Find a document by the ID field.
 *
 * @param collection - The collection to find the document in.
 * @param id - The ID of the document to find.
 * @param options - The options to find the document with.
 * @returns The document for the ID or `null` if the document is not found.
 * @throws A formatted error message when the request fails.
 */
export const findById = async <T extends CollectionSlug>(
  collection: T,
  id: number | string,
  options: RequestBaseOptions
): Promise<CollectionWithoutPayload[T] | null> => {
  const response = await invokeRequest(collection, {
    ...options,
    method: 'GET',
    query: `where[id][equals]=${encodeURIComponent(id)}`
  });

  if ('error' in response) {
    throw new Error(
      `Error fetching '${id}' from '${collection}': ${response.error}`
    );
  }

  return response.data?.[0] ?? null;
};
