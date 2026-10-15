import {
  PLATFORM_EMAIL_BRAND,
  renderVerifyEmailMail
} from '@codeware/app-cms/util/email';
import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { BasePayload } from 'payload';

/**
 * The mail that confirms a self-serve user's address, in the platform's brand.
 *
 * The link is built from the configured server URL, never the request's
 * origin: a forged Host would send the token elsewhere.
 */
export function verifyEmailMail(
  payload: BasePayload,
  {
    token,
    name,
    locale
  }: { token: string; name?: string | null; locale: SupportedLocale }
) {
  const { config } = payload;
  const serverURL = (config.serverURL ?? '').replace(/\/+$/, '');
  if (!serverURL) {
    payload.logger.error('serverURL is not set; the verify link is relative');
  }

  return renderVerifyEmailMail({
    locale,
    brand: PLATFORM_EMAIL_BRAND,
    name,
    verifyUrl: `${serverURL}${config.routes.admin}/users/verify/${token}`
  });
}
