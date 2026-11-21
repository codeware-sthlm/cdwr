import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type NotificationMailInput = {
  locale: SupportedLocale;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  tourTitle: string;
  people: number;
  /** Whether capacity put this signup on the waiting list */
  queued: boolean;
  /** Workspace name, used as the sign-off */
  from: string; /** Header with logo and accent; omitted for a plain mail */
  brand?: EmailBrand;
};

/**
 * The mail the guide gets when someone signs up.
 *
 * Carries the contact details on purpose: the point of the notification is
 * that a guide can act on it from their phone without opening the admin, and
 * a mail that only says "you have a new signup" fails that.
 *
 * It also says whether the signup was queued, because that is the case where
 * the guide may want to do something — call the customer, or open another
 * place.
 */
export function renderNotificationMail(input: NotificationMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    brand,
    customerEmail,
    customerName,
    customerPhone,
    from,
    locale,
    people,
    queued,
    tourTitle
  } = input;

  const subject = t(locale, 'tourSignupEmail.subjectNotification', {
    tour: tourTitle
  });

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'tourSignupEmail.notificationBody', {
        name: customerName,
        people: String(people),
        tour: tourTitle
      })
    ],
    detailsHeading: t(locale, 'tourSignupEmail.notificationHeading'),
    details: [
      [t(locale, 'tourSignupEmail.tourLabel'), tourTitle],
      [t(locale, 'tourSignupEmail.peopleLabel'), String(people)],
      [
        t(locale, 'tourSignupEmail.statusLabel'),
        t(
          locale,
          queued
            ? 'tourSignupEmail.statusWaiting'
            : 'tourSignupEmail.statusBooked'
        )
      ],
      ['Email', customerEmail],
      ...(customerPhone
        ? ([['Phone', customerPhone]] as Array<[string, string]>)
        : [])
    ],
    from,
    brand
  });

  return { subject, html, text };
}
