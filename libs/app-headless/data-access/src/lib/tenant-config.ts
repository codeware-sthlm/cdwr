import type { Env } from '@codeware/app-headless/util/env-schema';
import { getTenantConfig } from '@codeware/shared/util/payload-api';

import { memoiseAsync } from './memoise-async';
import { payloadRequestOptions } from './payload-request';

/** The tenant's config, `null` when the tenant has none */
export type TenantConfig = NonNullable<
  Awaited<ReturnType<typeof getTenantConfig>>
>;

/**
 * A loader for the tenant's config, shared by every request for a short
 * while: the document, the sitemap, the icon and each statistics beacon all
 * need it. Create one per process.
 *
 * The loader throws when the cms cannot be reached, for the caller to decide
 * what that means; `null` when the tenant has no config.
 *
 * @param getEnv - Read on every load
 */
export function createTenantConfigLoader(getEnv: () => Env) {
  return memoiseAsync(
    () => getTenantConfig(payloadRequestOptions(getEnv())),
    30_000
  );
}
