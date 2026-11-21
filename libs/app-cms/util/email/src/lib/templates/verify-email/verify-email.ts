import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type VerifyEmailMailInput = {
  locale: SupportedLocale;
  /** Who the mail is from, named in the body and shown as the header */
  brand: EmailBrand;
  /** Absolute link that confirms the address */
  verifyUrl: string;
  name?: string | null;
};

/**
 * The welcome mail that asks a new signup to confirm their email address.
 *
 * The link is the button and is also spelled out beneath it. The last
 * paragraph tells someone who never signed up that nothing happens unless
 * they follow the link.
 */
export function renderVerifyEmailMail(input: VerifyEmailMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { brand, locale, name, verifyUrl } = input;

  const subject = t(locale, 'verifyEmail.subject');

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      name
        ? t(locale, 'verifyEmail.greetingNamed', { name })
        : t(locale, 'verifyEmail.greeting'),
      t(locale, 'verifyEmail.body', { brand: brand.name }),
      t(locale, 'verifyEmail.afterConfirm'),
      t(locale, 'verifyEmail.ignore')
    ],
    brand,
    cta: { label: t(locale, 'verifyEmail.button'), url: verifyUrl },
    from: brand.name
  });

  return { subject, html, text };
}
