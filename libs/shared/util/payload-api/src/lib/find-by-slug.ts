import type {
  CollectionSlug,
  CollectionWithoutPayload
} from '@codeware/shared/util/payload-types';

import { invokeRequest } from './utils/invoke-request';
import type { RequestBaseOptions } from './utils/types';

/**
 * Find a document by the slug field.
 *
 * @param collection - The collection to find the document in.
 * @param slug - The slug of the document to find.
 * @param options - The options to find the document with.
 * @returns The document for the slug or `null` if the document is not found.
 * @throws A formatted error message when the request fails.
 */
export const findBySlug = async <T extends CollectionSlug>(
  collection: T,
  slug: string,
  options: RequestBaseOptions
): Promise<CollectionWithoutPayload[T] | null> => {
  const response = await invokeRequest(collection, {
    ...options,
    method: 'GET',
    query: `where[slug][equals]=${encodeURIComponent(slug)}`
  });

  if ('error' in response) {
    throw new Error(
      `Error fetching '${slug}' from '${collection}': ${response.error}`
    );
  }

  return response.data?.[0] ?? null;
};
