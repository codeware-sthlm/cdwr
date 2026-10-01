import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { Tenant } from '@codeware/shared/util/payload-types';
import { findPlatformTenant } from '@codeware/shared/util/seed';
import { Payload } from 'payload';

import { findTenantByApiKey } from './find-tenant-by-api-key';

/**
 * Resolves the active tenant based on the current deployment's API key in tenant mode.
 * @param payload - The Payload instance for database access
 * @returns The active Tenant or undefined if not in tenant mode or tenant not found
 */
export const resolveScopedTenant = async (
  payload: Payload
): Promise<Tenant | undefined> => {
  const { APP_MODE, DEPLOY_ENV } = getEnv();

  if (APP_MODE.type !== 'tenant') {
    return undefined;
  }

  // Resolve the active tenant API key.
  let apiKey = APP_MODE.apiKey || null;

  if (!apiKey) {
    // "Just in case" guard
    if (DEPLOY_ENV !== 'development') {
      payload.logger.warn(
        'Tenant API key not set in environment variables. Ensure PAYLOAD_API_KEY is set.'
      );
      return undefined;
    }

    apiKey = findPlatformTenant(APP_MODE.tenantId)?.apiKey ?? null;
  }

  if (!apiKey) {
    return undefined;
  }

  return findTenantByApiKey(payload, apiKey);
};
