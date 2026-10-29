import { getTenantConfig } from '@codeware/shared/util/payload-api';
import { svgMark } from '@codeware/shared/util/pure';

import { getEnv } from '../env.server';

import { payloadRequestOptions } from './payload-request';

/** The cache header every image route sends */
export const IMAGE_CACHE_CONTROL = 'public, max-age=3600';

/** The tenant's config, or null when the cms cannot be reached */
async function loadTenantConfig() {
  try {
    return await getTenantConfig(payloadRequestOptions(getEnv()));
  } catch (error) {
    console.error('Failed to load the tenant config:', error);
    return null;
  }
}

/** The tenant's SVG mark, or null when it has none or the cms cannot be reached */
export async function loadTenantMark(): Promise<string | null> {
  return svgMark((await loadTenantConfig())?.icon ?? null);
}
