import type { LegalTemplateVars } from '@codeware/app-cms/util/content-templates';
import type { SiteTheme } from '@codeware/shared/theme';

export const STARTER_PURPOSES = [
  'business',
  'portfolio',
  'association'
] as const;
export type StarterPurpose = (typeof STARTER_PURPOSES)[number];

/** Home is always included, so it is not a choice */
export const STARTER_PAGES = ['about', 'contact', 'news', 'privacy'] as const;
export type StarterPage = (typeof STARTER_PAGES)[number];

export const STARTER_LOCALES = ['en', 'sv'] as const;
export type StarterLocale = (typeof STARTER_LOCALES)[number];

/** What the privacy text must be truthful about; the rest it fills in itself */
export type StarterPrivacyFacts = Omit<
  LegalTemplateVars,
  'tenantName' | 'contactEmail'
>;

export type StarterAnswers = {
  purpose: StarterPurpose;
  pages: ReadonlyArray<StarterPage>;
  theme: SiteTheme;
  /** The tenant's name */
  appName: string;
  /** The signup user's email. Only receives contact form messages; never shown on the site */
  email: string;
  privacy: StarterPrivacyFacts;
  locale: StarterLocale;
};
