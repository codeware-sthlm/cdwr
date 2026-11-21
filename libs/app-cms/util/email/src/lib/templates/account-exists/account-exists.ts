import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type AccountExistsMailInput = {
  locale: SupportedLocale;
  /** Who the mail is from, shown as the header */
  brand: EmailBrand;
  /** Absolute link to the sign-in page */
  loginUrl: string;
  /** Absolute link to the password reset page */
  resetUrl: string;
};

/**
 * The mail an address gets when someone tries to sign up with it again.
 *
 * It never greets by name: the person who submitted the form may not be the
 * owner of the address, and the mail must not reveal anything about the
 * account beyond its existence.
 */
export function renderAccountExistsMail(input: AccountExistsMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { brand, locale, loginUrl, resetUrl } = input;

  const subject = t(locale, 'accountExists.subject');

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'accountExists.body'),
      t(locale, 'accountExists.ignore')
    ],
    brand,
    cta: { label: t(locale, 'accountExists.signIn'), url: loginUrl },
    links: [{ label: t(locale, 'accountExists.reset'), url: resetUrl }],
    from: brand.name
  });

  return { subject, html, text };
}
