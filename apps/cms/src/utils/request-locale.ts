import type { SupportedLocale } from '@codeware/shared/util/i18n';
import { headers } from 'next/headers';

/** The locale an `accept-language` header asks for; Swedish or English */
export const localeFromAcceptLanguage = (accepted: string): SupportedLocale =>
  accepted.toLowerCase().startsWith('sv') ? 'sv' : 'en';

/** The visitor's locale, read from the current request */
export const getRequestLocale = async (): Promise<SupportedLocale> =>
  localeFromAcceptLanguage((await headers()).get('accept-language') ?? '');
