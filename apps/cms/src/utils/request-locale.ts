import type { SupportedLocale } from '@codeware/shared/util/i18n';
import { cookies, headers } from 'next/headers';

/** Payload's cookie prefix; the config sets none, so this is its default */
const PAYLOAD_COOKIE_PREFIX = 'payload';

/** The cookie the admin keeps its language in, which the auth pages share */
export const LANGUAGE_COOKIE = `${PAYLOAD_COOKIE_PREFIX}-lng`;

/** The locale an `accept-language` header asks for; Swedish or English */
export const localeFromAcceptLanguage = (accepted: string): SupportedLocale =>
  accepted.toLowerCase().startsWith('sv') ? 'sv' : 'en';

/**
 * The language of every page on the way in, in the admin's own order: the
 * chosen language first, then the browser's, then English.
 */
export const resolveAuthLocale = (
  cookieValue: string | undefined,
  acceptLanguage: string
): SupportedLocale =>
  cookieValue === 'sv' || cookieValue === 'en'
    ? cookieValue
    : localeFromAcceptLanguage(acceptLanguage);

/** The visitor's locale, read from the current request */
export const getRequestLocale = async (): Promise<SupportedLocale> =>
  resolveAuthLocale(
    (await cookies()).get(LANGUAGE_COOKIE)?.value,
    (await headers()).get('accept-language') ?? ''
  );
