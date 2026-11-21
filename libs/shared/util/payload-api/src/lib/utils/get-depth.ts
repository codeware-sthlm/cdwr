import type { RestApiTarget } from '@codeware/shared/util/payload-types';

import type { RequestOptions } from './types';

/**
 * Get the depth for a GET request.
 *
 * Depth defaults to 2, unless the request asks for its own.
 *
 * @param target - The collection or endpoint to get the depth for.
 * @param options - The options to get the depth for.
 * @returns The depth for the collection or `null` when not applicable.
 */
export const getDepth = (target: RestApiTarget, options: RequestOptions) => {
  if (options.method !== 'GET') {
    return null;
  }

  if (options.depth !== undefined) {
    return options.depth;
  }

  // Custom depth for collections
  switch (target) {
    case 'tenant-config':
      // Tenant config returns a flat structure with no relationships
      return 0;
    case 'site-settings':
      // Landing page cards could have links with reference to other collections
      // for which we need the slug to be resolved
      return 3;
    default:
      return 2;
  }
};
