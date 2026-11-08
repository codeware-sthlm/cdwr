import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { SiteSetting, User } from '@codeware/shared/util/payload-types';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../resolve-scoped-tenant';

/** The issuer when no single tenant names the entry */
export const PLATFORM_TOTP_ISSUER = 'Codeware';

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

  const tenants = (req.user as User | null)?.tenants ?? [];
  if (tenants.length !== 1) {
    return null;
  }
  const { tenant } = tenants[0];
  return { id: typeof tenant === 'object' ? tenant.id : tenant, ownApp: false };
}

/**
 * The icon url, only where the app serves the tenant's site: `/site-icon.png`
 * answers for an SVG mark and 404s otherwise, as for the reset mail's logo
 */
function iconUrl(
  settings: SiteSetting,
  serverURL: string | undefined
): string | undefined {
  const { icon } = settings.general;
  return serverURL && icon?.source === 'svg' && icon.svgCode?.trim()
    ? `${serverURL.replace(/\/+$/, '')}/site-icon.png?size=64`
    : undefined;
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

    const image = tenant.ownApp
      ? iconUrl(settings, req.payload.config.serverURL)
      : undefined;
    return image ? { issuer, image } : { issuer };
  } catch (error) {
    req.payload.logger.warn(
      `[totp] Could not read site settings, using the platform name: ${String(error)}`
    );
    return fallback;
  }
}
