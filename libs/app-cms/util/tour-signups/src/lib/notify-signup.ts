import {
  type BuiltInThemes,
  type EmailBrand,
  emailBrandFromSettings,
  renderSeatsFreedMail,
  sendTourSignupEmails
} from '@codeware/app-cms/util/email';
import { getId } from '@codeware/app-cms/util/misc';
import type { SupportedLocale } from '@codeware/shared/util/i18n';
import { resolveSignupPolicy } from '@codeware/shared/util/payload-api';
import type { Tour, TourSignup } from '@codeware/shared/util/payload-types';
import { formatDayOnlyDate } from '@codeware/shared/util/pure';
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload';

/**
 * Mail the guide when a tour holds free seats and a queue at the same time.
 *
 * Only sent when both are true: seats without a queue fill themselves from the
 * site, and a queue without seats is simply a full tour. The pair is the state
 * that needs a person, and it is invisible unless somebody opens the tour.
 */
async function notifySeatsFreed({
  brand,
  from,
  locale,
  recipients,
  req,
  tour,
  tourId
}: {
  brand: EmailBrand | undefined;
  from: string;
  locale: SupportedLocale;
  recipients: Array<string>;
  req: PayloadRequest;
  tour: Tour;
  tourId: number;
}): Promise<void> {
  const { payload } = req;

  if (!recipients.length || !tour.maxCustomers) {
    return;
  }

  const { docs: signups } = await payload.find({
    collection: 'tour-signups',
    where: {
      and: [
        { tour: { equals: tourId } },
        { status: { in: ['booked', 'waiting'] } }
      ]
    },
    depth: 0,
    pagination: false,
    sort: ['queuePosition', 'createdAt'],
    overrideAccess: true,
    req
  });

  const booked = signups
    .filter((signup) => signup.status === 'booked')
    .reduce((total, signup) => total + (signup.people ?? 0), 0);
  const seatsFree = Math.max(tour.maxCustomers - booked, 0);
  const first = signups.find((signup) => signup.status === 'waiting');

  if (!seatsFree || !first) {
    return;
  }

  const serverURL = payload.config.serverURL ?? '';
  const adminRoute = payload.config.routes?.admin ?? '/admin';

  const mail = renderSeatsFreedMail({
    locale,
    tourTitle: tour.title,
    seatsFree,
    brand,
    firstInQueue: first.name,
    firstInQueuePeople: first.people,
    tourUrl: serverURL
      ? `${serverURL}${adminRoute}/collections/tours/${tourId}`
      : null,
    from
  });

  try {
    await payload.sendEmail({ to: recipients, ...mail });
  } catch (error) {
    payload.logger.error(
      `[notifySignup] Could not send "${mail.subject}": ${String(error)}`
    );
  }
}

/**
 * Tell the customer, and the guide, what happened to a signup.
 *
 * Fires on the two moments that change what a customer knows: they signed up
 * (confirmed, or queued), and they were promoted off the waiting list. A
 * promotion is a mail the guide asked for by pressing the button — the whole
 * reason promotion is manual is that a customer has to be told.
 *
 * Cancellations send nothing to the customer — a guide cancelling a drop-off
 * is usually recording something the customer already told them, and mailing
 * "you have been cancelled" back at them would be worse than silence. They do
 * reach the guide when they free seats on a tour with a queue, because signups
 * are served in order and nobody but the guide can fill those seats.
 */
export const createNotifySignup =
  (options: {
    /** Pass `BUILT_IN_TOKENS`; a util lib cannot import the theme lib itself */
    builtInTokens: BuiltInThemes;
    /** Whether this app serves the tenant's site, and so its `/site-icon.png` */
    servesTenantSite: () => boolean;
  }): CollectionAfterChangeHook<TourSignup> =>
  async ({ context, doc, operation, previousDoc, req }) => {
    // Seed data is not a real signup — nobody should be mailed about it
    if (context?.['seedAction']) {
      return doc;
    }

    const promoted =
      operation === 'update' &&
      previousDoc?.status === 'waiting' &&
      doc.status === 'booked';

    // Cancelled, or moved back to the queue: seats this signup held are now free
    const releasedSeats =
      operation === 'update' &&
      previousDoc?.status === 'booked' &&
      doc.status !== 'booked';

    if (operation !== 'create' && !promoted && !releasedSeats) {
      return doc;
    }

    // A cancelled signup created by hand has nothing to confirm
    if (operation === 'create' && doc.status === 'cancelled') {
      return doc;
    }

    const { payload } = req;

    try {
      const tourId = getId(doc.tour);
      const tenantId = getId(doc.tenant);

      // Settings first: they carry the workspace's locale, and the tour's title
      // only exists in that locale — read in another one it comes back empty
      const { docs } = await payload.find({
        collection: 'site-settings',
        where: { tenant: { equals: tenantId } },
        depth: 1,
        limit: 1,
        overrideAccess: true,
        disableErrors: true,
        req
      });
      const settings = docs[0] ?? null;
      const locale =
        (settings?.general?.defaultLocale as SupportedLocale) ?? 'en';

      const tour = await payload.findByID({
        collection: 'tours',
        id: tourId,
        depth: 0,
        locale,
        overrideAccess: true,
        disableErrors: true,
        req
      });

      if (!tour) {
        return doc;
      }

      const brand = settings
        ? emailBrandFromSettings(settings, {
            serverURL: options.servesTenantSite()
              ? (payload.config.serverURL ?? undefined)
              : undefined,
            fallbackName: '',
            builtInTokens: options.builtInTokens
          })
        : undefined;

      const recipients = (settings?.tourSignups?.notificationRecipients ?? [])
        .map((entry) => entry.email)
        .filter(Boolean);

      if (releasedSeats) {
        await notifySeatsFreed({
          brand,
          from: settings?.general?.appName ?? '',
          locale,
          recipients,
          req,
          tour,
          tourId
        });
        return doc;
      }

      const policy = resolveSignupPolicy(settings);
      const serverURL = payload.config.serverURL ?? '';
      const absolute = (path: string | null) =>
        path ? `${serverURL}${path}` : null;

      await sendTourSignupEmails({
        payload,
        brand,
        kind: promoted ? 'promoted' : (doc.status as 'booked' | 'waiting'),
        locale,
        from: settings?.general?.appName ?? '',
        customer: { name: doc.name, email: doc.email, phone: doc.phone },
        tour: {
          title: tour.title,
          // Readable in the workspace's own language, not the stored timestamp.
          // A tour with no confirmed date falls back to whatever the editor
          // wrote instead, which is already prose.
          departureLabel:
            formatDayOnlyDate(tour.departureDate, locale) ||
            tour.departureNote ||
            null
        },
        people: doc.people,
        notificationRecipients: (
          settings?.tourSignups?.notificationRecipients ?? []
        )
          .map((entry) => entry.email)
          .filter(Boolean),
        privacyUrl: absolute(policy.privacyUrl),
        termsUrl: absolute(policy.termsUrl)
      });
    } catch (error) {
      // Never fail the write for a mail — the place on the tour is the thing
      payload.logger.error(`[notifySignup] Could not notify: ${String(error)}`);
    }

    return doc;
  };
