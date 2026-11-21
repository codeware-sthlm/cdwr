import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type EmailBrand,
  PLATFORM_EMAIL_BRAND,
  emailBrandFromSettings,
  renderForgotPasswordMail
} from '@codeware/app-cms/util/email';
import { BUILT_IN_TOKENS } from '@codeware/shared/theme';
import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { SiteSetting } from '@codeware/shared/util/payload-types';
import type { PayloadRequest } from 'payload';

import { resolveScopedTenant } from '../../security/resolve-scoped-tenant';

type Mail = ReturnType<typeof renderForgotPasswordMail>;

const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === 'sv' || value === 'en';

/** The tenant's site settings, or null in host mode or when they cannot be read */
async function tenantSettings(
  req: PayloadRequest
): Promise<SiteSetting | null> {
  if (getEnv().APP_MODE.type !== 'tenant') {
    return null;
  }

  try {
    const tenant = await resolveScopedTenant(req.payload);
    return tenant
      ? await getSiteSettingsForTenant(req.payload, tenant.id, { depth: 1 })
      : null;
  } catch (error) {
    // Branding must never stop a password reset
    req.payload.logger.warn(
      `[forgotPassword] Could not read site settings, using the platform brand: ${String(error)}`
    );
    return null;
  }
}

async function buildMail({
  req,
  token,
  user
}: {
  req: PayloadRequest;
  token: string;
  user: { name?: string | null };
}): Promise<Mail> {
  const { config } = req.payload;
  // Never the request's origin: a forged Host or Origin would send the token elsewhere
  const serverURL = (config.serverURL ?? '').replace(/\/+$/, '');
  if (!serverURL) {
    req.payload.logger.error(
      'serverURL is not set; the reset link is relative'
    );
  }
  const resetUrl = `${serverURL}${config.routes.admin}${config.admin.routes.reset}/${token}`;

  const settings = await tenantSettings(req);

  const brand: EmailBrand = settings
    ? emailBrandFromSettings(settings, {
        serverURL,
        builtInTokens: BUILT_IN_TOKENS,
        fallbackName: PLATFORM_EMAIL_BRAND.name
      })
    : PLATFORM_EMAIL_BRAND;

  const requested = req.i18n.language;
  const stored = settings?.general.defaultLocale;
  const locale: SupportedLocale = isSupportedLocale(requested)
    ? requested
    : isSupportedLocale(stored)
      ? stored
      : 'en';

  return renderForgotPasswordMail({
    locale,
    brand,
    resetUrl,
    name: user.name
  });
}

const cache = new WeakMap<
  PayloadRequest,
  { token: string; mail: Promise<Mail> }
>();

/**
 * The reset mail for a request. Payload asks for the html and the subject
 * separately; both are served from one build per request and token.
 */
export function forgotPasswordMail(args: {
  req: PayloadRequest;
  token: string;
  user: { name?: string | null };
}): Promise<Mail> {
  const hit = cache.get(args.req);
  if (hit?.token === args.token) {
    return hit.mail;
  }

  const mail = buildMail(args);
  cache.set(args.req, { token: args.token, mail });
  return mail;
}
