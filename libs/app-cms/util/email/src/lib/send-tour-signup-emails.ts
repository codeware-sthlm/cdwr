import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { Payload } from 'payload';

import type { EmailBrand } from './templates/layout';
import {
  type CustomerMailKind,
  renderCustomerMail
} from './templates/tour-signup/customer';
import { renderNotificationMail } from './templates/tour-signup/notification';

export type TourSignupMailInput = {
  payload: Payload;
  kind: CustomerMailKind;
  locale: SupportedLocale;
  /** Workspace name, used as the sign-off */
  from: string;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
  };
  tour: {
    title: string;
    departureLabel?: string | null;
  };
  people: number;
  /** Guide addresses configured for the workspace; empty means nobody is told */
  notificationRecipients?: Array<string>;
  privacyUrl?: string | null;
  termsUrl?: string | null;
  /** Sender identity for both mails */
  brand?: EmailBrand;
};

/**
 * Send the mail a signup generates: one to the customer, one to the guide.
 *
 * Never throws. A signup that reached the database is a place on a tour, and
 * losing it because an SMTP host was briefly unreachable would be the worse
 * failure by far — a missing confirmation is visible and recoverable, a
 * missing signup is neither. Failures are logged instead.
 *
 * The guide is only notified about a new signup; a promotion is a mail the
 * guide themselves triggered, so telling them about it is noise.
 */
export async function sendTourSignupEmails({
  brand,
  customer,
  from,
  kind,
  locale,
  notificationRecipients = [],
  payload,
  people,
  privacyUrl,
  termsUrl,
  tour
}: TourSignupMailInput): Promise<void> {
  const send = async (
    to: string | Array<string>,
    mail: { subject: string; html: string; text: string }
  ) => {
    try {
      await payload.sendEmail({ to, ...mail });
    } catch (error) {
      payload.logger.error(
        `[tourSignupEmails] Could not send "${mail.subject}": ${String(error)}`
      );
    }
  };

  await send(
    customer.email,
    renderCustomerMail({
      kind,
      locale,
      customerName: customer.name,
      tourTitle: tour.title,
      departureLabel: tour.departureLabel,
      people,
      privacyUrl,
      termsUrl,
      from,
      brand
    })
  );

  if (kind !== 'promoted' && notificationRecipients.length) {
    await send(
      notificationRecipients,
      renderNotificationMail({
        locale,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        tourTitle: tour.title,
        people,
        queued: kind === 'waiting',
        from,
        brand
      })
    );
  }
}
