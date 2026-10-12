import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type SeatsFreedMailInput = {
  locale: SupportedLocale;
  tourTitle: string;
  /** Places now free on the tour */
  seatsFree: number;
  /** Name of whoever is first in the waiting list */
  firstInQueue: string;
  /** People that first party is for — they may need more seats than are free */
  firstInQueuePeople: number;
  /** Absolute link to the tour in the admin, so the guide can act from the mail */
  tourUrl?: string | null;
  /** Workspace name, used as the sign-off */
  from: string; /** Header with logo and accent; omitted for a plain mail */
  brand?: EmailBrand;
};

/**
 * Tell the guide that seats opened up while people are waiting.
 *
 * Signups are served in order, so a free seat is never taken by the next
 * visitor — only a promotion fills it. That makes this the one moment where
 * doing nothing quietly costs money: the tour stops selling, and nothing on
 * the site or in the inbox would otherwise say so.
 *
 * Deliberately actionable rather than informational: it names who is first,
 * how many places they need, and links straight to the tour.
 */
export function renderSeatsFreedMail(input: SeatsFreedMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    brand,
    firstInQueue,
    firstInQueuePeople,
    from,
    locale,
    seatsFree,
    tourTitle,
    tourUrl
  } = input;

  const subject = t(locale, 'tourSignupEmail.subjectSeatsFreed', {
    tour: tourTitle
  });

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'tourSignupEmail.seatsFreedBody', {
        count: String(seatsFree),
        name: firstInQueue,
        people: String(firstInQueuePeople),
        tour: tourTitle
      }),
      t(locale, 'tourSignupEmail.seatsFreedAction')
    ],
    detailsHeading: t(locale, 'tourSignupEmail.detailsHeading'),
    details: [
      [t(locale, 'tourSignupEmail.tourLabel'), tourTitle],
      [t(locale, 'tourSignupEmail.seatsFreeLabel'), String(seatsFree)],
      [
        t(locale, 'tourSignupEmail.firstInQueueLabel'),
        `${firstInQueue} (${firstInQueuePeople})`
      ]
    ],
    links: tourUrl
      ? [{ label: t(locale, 'tourSignupEmail.openTour'), url: tourUrl }]
      : [],
    from,
    brand
  });

  return { subject, html, text };
}
