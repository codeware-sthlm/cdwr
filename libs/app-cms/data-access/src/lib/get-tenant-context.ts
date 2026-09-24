import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { resolveTenantSeedFromSlug } from '@codeware/shared/util/seed';
import { headers } from 'next/headers';
import { cache } from 'react';

type TenantContext = {
  tenantApiKey: string;
};

/**
 * Get tenant context when running in tenant mode.
 *
 * In deployed environments, tenant API key is expected to be set in environment variables (PAYLOAD_API_KEY).
 *
 * **In development**, tenant API key is resolved from seed data via slug:
 * - First tries `X-Tenant-Host` header to resolve the slug from the host (`{slug}.localhost`).
 * - Falling back to `TENANT_ID`
 * - Then to `PAYLOAD_API_KEY`, for a workspace the seed does not describe
 *
 * Uses React cache() for per-request memoization to avoid redundant lookups.
 *
 * @returns Tenant context or null if not available (cms host deployment)
 */
export const getTenantContext = cache(
  async (): Promise<TenantContext | null> => {
    const { APP_MODE, DEPLOY_ENV } = getEnv();

    if (APP_MODE.type === 'host') {
      // Running as headless CMS host, no tenant context available
      return null;
    }

    // Tenant details from environment is expected for a deployed tenant app
    if (DEPLOY_ENV !== 'development') {
      return {
        tenantApiKey: APP_MODE.apiKey
      };
    }

    // In development, get slug from X-Tenant-Host header or the tenant ID
    const headersList = await headers();
    const hostSlug = headersList.has('x-tenant-host')
      ? headersList.get('x-tenant-host')?.split('.')[0] || ''
      : '';
    const tenantSlug = hostSlug || APP_MODE.tenantId;

    const tenant = await resolveTenantSeedFromSlug(tenantSlug);
    if (tenant) {
      // Found tenant from slug, return its seeded API key
      return {
        tenantApiKey: tenant.apiKey
      };
    }

    // A workspace made by `cdwr tenant create` is not in the seed, so its key
    // comes from the environment the way a deployed tenant's does. Only when
    // the slug is this process's own: behind the proxy one process serves
    // several hosts, and a single key cannot stand for all of them
    if (!hostSlug && APP_MODE.apiKey) {
      return { tenantApiKey: APP_MODE.apiKey };
    }

    console.error(
      `No API key for '${tenantSlug}'. The development seed does not describe ` +
        'this workspace, so set PAYLOAD_API_KEY to the key ' +
        '`cdwr tenant create` reported for it.'
    );
    return null;
  }
);
