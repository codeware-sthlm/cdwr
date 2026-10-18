import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type StatsAccountMailInput = {
  locale: SupportedLocale;
  /** Whose statistics these are, named in the body and shown as the header */
  brand: EmailBrand;
  /** Absolute link to Umami's login page */
  loginUrl: string;
  username: string;
  /** The generated password, shown once in the mail */
  password: string;
};

/**
 * The mail that carries a Umami login for a tenant's statistics.
 *
 * The password is set apart in a monospace block so it can be copied, and the
 * last line asks for it to be changed in Umami's profile after signing in.
 */
export function renderStatsAccountMail(input: StatsAccountMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { brand, locale, loginUrl, password, username } = input;

  const subject = t(locale, 'statsAccountEmail.subject');

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'statsAccountEmail.body', { brand: brand.name }),
      t(locale, 'statsAccountEmail.changePassword')
    ],
    brand,
    cta: { label: t(locale, 'statsAccountEmail.button'), url: loginUrl },
    detailsHeading: t(locale, 'statsAccountEmail.heading'),
    details: [[t(locale, 'statsAccountEmail.usernameLabel'), username]],
    code: [t(locale, 'statsAccountEmail.passwordLabel'), password],
    from: brand.name
  });

  return { subject, html, text };
}
