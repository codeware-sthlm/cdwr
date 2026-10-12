import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

/** Which of the three things that can happen to a customer's signup */
export type CustomerMailKind = 'booked' | 'waiting' | 'promoted';

export type CustomerMailInput = {
  kind: CustomerMailKind;
  locale: SupportedLocale;
  customerName: string;
  tourTitle: string;
  people: number;
  /** Pre-formatted departure, omitted while the date is unconfirmed */
  departureLabel?: string | null;
  /** Absolute urls; the customer keeps a copy of what they agreed to */
  privacyUrl?: string | null;
  termsUrl?: string | null;
  /** Workspace name, used as the sign-off */
  from: string; /** Header with logo and accent; omitted for a plain mail */
  brand?: EmailBrand;
};

/**
 * The mail a customer gets about their own signup.
 *
 * One template for three outcomes rather than three near-identical files: the
 * details block and the sign-off are the same in all of them, and only the
 * subject and the opening paragraph differ. Splitting them would guarantee the
 * shared half drifts.
 *
 * A queued customer is told plainly that nothing is charged and they may
 * change their mind — a waiting list that reads like a booking is worse than
 * no waiting list.
 */
export function renderCustomerMail(input: CustomerMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    brand,
    customerName,
    departureLabel,
    from,
    kind,
    locale,
    people,
    privacyUrl,
    termsUrl,
    tourTitle
  } = input;

  const subject = t(
    locale,
    kind === 'waiting'
      ? 'tourSignupEmail.subjectWaiting'
      : kind === 'promoted'
        ? 'tourSignupEmail.subjectPromoted'
        : 'tourSignupEmail.subjectBooked',
    { tour: tourTitle }
  );

  const body = t(
    locale,
    kind === 'waiting'
      ? 'tourSignupEmail.waitingBody'
      : kind === 'promoted'
        ? 'tourSignupEmail.promotedBody'
        : 'tourSignupEmail.bookedBody',
    { tour: tourTitle }
  );

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'tourSignupEmail.greeting', { name: customerName }),
      body,
      t(locale, 'tourSignupEmail.questions')
    ],
    detailsHeading: t(locale, 'tourSignupEmail.detailsHeading'),
    details: [
      [t(locale, 'tourSignupEmail.tourLabel'), tourTitle],
      ...(departureLabel
        ? ([
            [t(locale, 'tourSignupEmail.departureLabel'), departureLabel]
          ] as Array<[string, string]>)
        : []),
      [t(locale, 'tourSignupEmail.peopleLabel'), String(people)],
      [
        t(locale, 'tourSignupEmail.statusLabel'),
        t(
          locale,
          kind === 'waiting'
            ? 'tourSignupEmail.statusWaiting'
            : 'tourSignupEmail.statusBooked'
        )
      ]
    ],
    links: [
      ...(privacyUrl
        ? [{ label: t(locale, 'tourSignupEmail.privacyLink'), url: privacyUrl }]
        : []),
      ...(termsUrl
        ? [{ label: t(locale, 'tourSignupEmail.termsLink'), url: termsUrl }]
        : [])
    ],
    from,
    brand
  });

  return { subject, html, text };
}
