import type { LegalTemplateVars } from '@codeware/app-cms/util/content-templates';
import {
  STARTER_PAGES,
  STARTER_PURPOSES,
  type StarterPage,
  type StarterPurpose
} from '@codeware/app-cms/util/definitions';
import type { SiteTheme } from '@codeware/shared/theme';

export { STARTER_PAGES, STARTER_PURPOSES };
export type { StarterPage, StarterPurpose };

export const STARTER_LOCALES = ['en', 'sv'] as const;
export type StarterLocale = (typeof STARTER_LOCALES)[number];

/** What the privacy text must be truthful about; the rest it fills in itself */
export type StarterPrivacyFacts = Omit<
  LegalTemplateVars,
  'tenantName' | 'contactEmail' | 'published' | 'forms'
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
