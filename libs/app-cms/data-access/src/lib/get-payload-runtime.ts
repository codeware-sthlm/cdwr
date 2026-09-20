import type { SanitizedConfig } from 'payload';

import { buildTenantConfig } from './build-tenant-config';
import { getCustomThemes } from './collections/get-custom-themes';
import { getGeneralSiteSettings } from './collections/get-general-site-settings';
import {
  type AuthenticatedPayloadOptions,
  getAuthenticatedPayload
} from './get-authenticated-payload';
import type { PayloadRuntime } from './payload-runtime.types';

/**
 * Get the authenticated payload and tenant runtime config.
 *
 * Tenant config can not be provided if there is no authenticated tenant user
 * or if the tenant's site settings cannot be loaded for the tenant.
 */
export async function getPayloadRuntime(
  payloadConfig: SanitizedConfig,
  options: AuthenticatedPayloadOptions = {}
): Promise<PayloadRuntime> {
  const payload = await getAuthenticatedPayload(payloadConfig, options);
  const siteSettings = await getGeneralSiteSettings({
    payload,
    tenantConfig: null
  });

  // Keyed on the tenant being served, not on the identity: a signed-in member
  // authenticates as themselves, and inferring the tenant from the identity
  // would strip their site of its configuration the moment they log in.
  if (!payload.tenant) {
    return {
      payload,
      tenantConfig: null
    };
  }
  if (!siteSettings) {
    // This can happen if the tenant's API key is invalid or missing,
    // or if the tenant user doesn't have access to the site settings
    return {
      payload,
      tenantConfig: null
    };
  }

  // Only a tenant request can have authored themes, and none selected means no
  // query at all
  const customThemes = await getCustomThemes(
    { payload, tenantConfig: null },
    siteSettings.customThemeIds
  );

  const tenantConfig = buildTenantConfig({
    settings: siteSettings,
    customThemes,
    tenant: payload.tenant
  });

  return {
    payload,
    tenantConfig
  };
}
