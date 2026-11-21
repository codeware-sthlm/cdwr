import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type ForgotPasswordMailInput = {
  locale: SupportedLocale;
  /** Who the mail is from, named in the body and shown as the header */
  brand: EmailBrand;
  /** Absolute link where the new password is chosen */
  resetUrl: string;
  name?: string | null;
};

/**
 * The mail that carries a password reset link.
 *
 * The link is the whole point, so it is the button and is also spelled out
 * beneath it for clients that block buttons. The last paragraph tells someone
 * who never asked that nothing happens unless they follow the link.
 */
export function renderForgotPasswordMail(input: ForgotPasswordMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { brand, locale, name, resetUrl } = input;

  const subject = t(locale, 'forgotPasswordEmail.subject');

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      name
        ? t(locale, 'forgotPasswordEmail.greetingNamed', { name })
        : t(locale, 'forgotPasswordEmail.greeting'),
      t(locale, 'forgotPasswordEmail.body', { brand: brand.name }),
      t(locale, 'forgotPasswordEmail.ignore')
    ],
    brand,
    cta: { label: t(locale, 'forgotPasswordEmail.button'), url: resetUrl },
    from: brand.name
  });

  return { subject, html, text };
}
