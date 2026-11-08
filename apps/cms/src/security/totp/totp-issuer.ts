import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { siteIconUrl } from '@codeware/app-cms/util/email';
import { getUserTenantIDs } from '@codeware/app-cms/util/misc';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../resolve-scoped-tenant';

import { PLATFORM_TOTP_ISSUER } from './totp-options';

export type TotpIssuer = {
  /** The name the authenticator app shows for the entry */
  issuer: string;
  /** The entry's icon, for the apps that read the `image` parameter */
  image?: string;
};

/**
 * Authenticator apps split `Issuer:account` on the colon, so the issuer
 * carries none
 */
const cleanIssuer = (name: string | null | undefined): string =>
  (name ?? '').replace(/:/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The tenant that names the entry: in tenant mode the app's own, in host
 * mode the user's only tenant. A user in several tenants, or a system user
 * in none, signs in with one code on every site, so the entry keeps the
 * platform's name.
 */
async function entryTenant(
  req: PayloadRequest
): Promise<{ id: number; ownApp: boolean } | null> {
  if (getEnv().APP_MODE.type === 'tenant') {
    const tenant = await resolveScopedTenant(req.payload);
    return tenant ? { id: tenant.id, ownApp: true } : null;
  }

  const tenantIds = getUserTenantIDs(req.user);
  return tenantIds.length === 1 ? { id: tenantIds[0], ownApp: false } : null;
}

/**
 * The issuer the setup view puts in the QR code, from the site settings'
 * `appName`. The issuer doesn't change the codes, so only a new scan shows
 * it. Branding never stops the setup: on an error it falls back to the
 * platform's name.
 */
export async function resolveTotpIssuer(
  req: PayloadRequest
): Promise<TotpIssuer> {
  const fallback: TotpIssuer = { issuer: PLATFORM_TOTP_ISSUER };

  try {
    const tenant = await entryTenant(req);
    if (!tenant) {
      return fallback;
    }

    const settings = await getSiteSettingsForTenant(req.payload, tenant.id);
    const issuer = cleanIssuer(settings?.general.appName);
    if (!settings || !issuer) {
      return fallback;
    }

    // Only the tenant's own app serves its `/site-icon.png`
    const image = tenant.ownApp
      ? siteIconUrl(settings, req.payload.config.serverURL)
      : undefined;
    return image ? { issuer, image } : { issuer };
  } catch (error) {
    req.payload.logger.warn(
      `[totp] Could not read site settings, using the platform name: ${String(error)}`
    );
    return fallback;
  }
}
