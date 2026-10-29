import { getTenantConfig } from '@codeware/shared/util/payload-api';

import { getEnv } from '../env.server';

import { memoiseAsync } from './memoise-async';
import { payloadRequestOptions } from './payload-request';

/**
 * The tenant's config, shared by every request for a short while: the
 * document, the sitemap, the icon and each statistics beacon all need it.
 *
 * Throws when the cms cannot be reached, for the caller to decide what that
 * means; `null` when the tenant has no config.
 */
export const loadTenantConfig = memoiseAsync(
  () => getTenantConfig(payloadRequestOptions(getEnv())),
  30_000
);
