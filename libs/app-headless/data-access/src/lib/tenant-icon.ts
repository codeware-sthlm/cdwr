import { svgMark } from '@codeware/shared/util/pure';

import type { ServerContext } from './server-context';

/** The cache header every image route sends */
export const IMAGE_CACHE_CONTROL = 'public, max-age=3600';

/** The tenant's SVG mark, or null when it has none or the cms cannot be reached */
export async function loadTenantMark(
  getContext: () => ServerContext
): Promise<string | null> {
  try {
    return svgMark((await getContext().loadTenantConfig())?.icon ?? null);
  } catch (error) {
    console.error('Failed to load the tenant config:', error);
    return null;
  }
}
