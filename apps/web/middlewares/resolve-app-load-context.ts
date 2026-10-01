import { randomUUID } from 'crypto';

import { getTenantConfig } from '@codeware/shared/util/payload-api';
import { TenantRuntimeConfig } from '@codeware/shared/util/payload-types';
import { findPlatformTenant } from '@codeware/shared/util/seed';
import { createMiddleware } from 'hono/factory';

import { getPayloadRequestOptions } from '../app/utils/get-payload-request-options';
import type { AppLoadContext } from '../app/utils/types';
import env from '../env-resolver/env';

/**
 * Middleware to resolve app load context.
 *
 * This middleware runs on every request and is responsible for resolving the tenant context,
 * including the tenant API key and tenant configuration.
 *
 * In development, it can resolve the tenant API key from the `X-Tenant-Host` header set by the multi-tenant Nginx proxy.
 * It then fetches the tenant configuration from the Payload API and sets it in the context for use in loaders and actions.
 */
export const resolveAppLoadContextMiddleware = createMiddleware<{
  Variables: AppLoadContext;
}>(async (c, next) => {
  // Initialize context details with what we could have at this point
  const context: AppLoadContext = {
    deviceId: randomUUID(),
    tenantApiKey: env.PAYLOAD_API_KEY ?? '',
    tenantId: env.TENANT_ID,
    tenantConfig: null,
    fallbackLocale: 'en'
  };

  // In development, we can also resolve the seeded tenant from Nginx header or tenant id env
  if (!context.tenantApiKey && env.DEPLOY_ENV === 'development') {
    let tenantSlug = '';
    if (c.req.header('X-Tenant-Host')) {
      tenantSlug = c.req.header('X-Tenant-Host')?.split('.')[0] || '';
    }
    if (!tenantSlug && context.tenantId) {
      tenantSlug = context.tenantId;
    }

    const tenant = findPlatformTenant(tenantSlug);
    if (tenant) {
      context.tenantApiKey = tenant.apiKey;
      context.tenantId ??= tenantSlug; // Fallback to tenant id from slug if not set in env
    } else {
      console.warn(
        `No platform tenant '${tenantSlug}', unable to resolve tenant API key`
      );
    }
  }

  // Here we assume to have the tenant context to fetch the tenant configuration from Payload
  const requestOptions = getPayloadRequestOptions('GET', context);

  // Don't break the app but let the loaders handle the missing tenant config individually
  let tenantConfig: TenantRuntimeConfig | null = null;
  try {
    tenantConfig = await getTenantConfig(requestOptions);
  } catch (error) {
    console.warn('Failed to resolve tenant configuration from Payload:', error);
  }

  c.set('deviceId', context.deviceId);
  c.set('fallbackLocale', context.fallbackLocale);
  c.set('tenantApiKey', context.tenantApiKey);
  c.set('tenantId', context.tenantId);
  c.set('tenantConfig', tenantConfig);

  await next();
});
