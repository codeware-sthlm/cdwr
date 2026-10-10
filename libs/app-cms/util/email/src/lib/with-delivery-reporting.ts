import * as Sentry from '@sentry/nextjs';
import type { EmailAdapter, SendEmailOptions } from 'payload';

/** Any address-looking token, so the local part can be dropped */
const EMAIL_PATTERN = /[^\s<>@,;:"]+@([^\s<>@,;:"]+)/g;

/**
 * Keep the domain, drop who.
 *
 * The domain is the half with diagnostic value — a run of failures to one
 * provider is the shape worth seeing — while the local part is the half that
 * identifies a person. Applied to the subject as well as the recipients: a
 * form's notification subject is an editor-authored template, so
 * `New message from {{name}}` expands to real personal data before it ever
 * reaches here.
 */
const redactEmails = (value: string): string =>
  value.replace(EMAIL_PATTERN, '***@$1');

/** Every address in whatever shape nodemailer was handed, nested lists included */
const listRecipients = (to: SendEmailOptions['to']): string[] => {
  if (Array.isArray(to)) {
    return to.flatMap(listRecipients);
  }
  if (typeof to === 'string') {
    return [to];
  }
  return to?.address ? [to.address] : [];
};

/** Recipients as one string */
const formatRecipients = (to: SendEmailOptions['to']): string =>
  listRecipients(to).filter(Boolean).join(', ');

/**
 * Make a transport failure loud instead of a line only `fly logs` sees.
 *
 * Every current caller of `payload.sendEmail` swallows its own rejection —
 * deliberately, since a form submission or a tour signup that reached the
 * database must not be undone by a mail provider being down. That leaves the
 * rejection with nowhere to surface: nothing downstream ever sees it (COD-288).
 *
 * Wrapping the adapter is the one place that can report every send without
 * touching each caller. It still rethrows, so a caller that does propagate
 * failures (Payload's own forgot-password flow, say) keeps deciding what
 * happens next — that path also reaches the config's `afterError` hook, so a
 * failure there is reported twice; accepted, since preventing it would mean
 * either silently swallowing here (masking exactly what this fixes) or
 * threading transport awareness into every caller instead of one adapter.
 *
 * Addresses are redacted on the way out. The form-builder plugin logs the full
 * recipient itself a moment later, so this does not make the address secret —
 * it keeps *this* report, which is the one that also reaches Sentry, free of
 * personal data that no diagnosis needs.
 */
export const withDeliveryReporting = (
  adapter: EmailAdapter | Promise<EmailAdapter>
): EmailAdapter | Promise<EmailAdapter> => {
  const wrap: (factory: EmailAdapter) => EmailAdapter = (factory) => (args) => {
    const inner = factory(args);

    return {
      ...inner,
      sendEmail: async (message) => {
        try {
          return await inner.sendEmail(message);
        } catch (err) {
          const recipients = formatRecipients(message.to);
          const to = redactEmails(recipients);
          const subject = redactEmails(String(message.subject ?? ''));

          args.payload.logger.error({
            err,
            msg: `[email] "${inner.name}" failed to send "${subject}" to ${to}`
          });
          Sentry.captureException(err, {
            tags: { emailTransport: inner.name },
            extra: {
              to,
              subject,
              // The count survives redaction and is what tells a single
              // failed send apart from a whole batch going nowhere
              recipientCount: recipients ? recipients.split(', ').length : 0
            }
          });
          throw err;
        }
      }
    };
  };

  return adapter instanceof Promise ? adapter.then(wrap) : wrap(adapter);
};
