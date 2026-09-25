import { getId } from '@codeware/app-cms/util/misc';
import type { Form } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type FormData = Pick<Form, 'tenant'> & {
  /** Where a submission is sent. Falls back to the workspace's generic recipient */
  emailTo?: string;
  /** Stable lookup key — not localized, so it stays the same per tenant */
  title: string;
  /** Label on the single email field */
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  /** Shown in the dialog after a successful send */
  confirmation: string;
  /** Subject of the notification sent to the workspace */
  subject: string;
};

/** Minimal Lexical value wrapping a single paragraph of text */
const paragraph = (text: string) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', text, version: 1 }]
      }
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1
  }
});

/**
 * Ensure a contact form exists for the given tenant.
 *
 * One email field and nothing else: this sits at the foot of the home page as
 * a closing invitation, where anything longer than a single input stops being
 * an invitation and starts being paperwork. It also means every environment
 * has a form that really sends mail, so a broken mail setup shows up by using
 * the site instead of by reading logs.
 *
 * `emailFrom` and `emailTo` are deliberately left empty. `emailFrom` falls
 * back to the configured default sender, so the form needs no per-tenant
 * address and follows whatever transport the environment resolved — Mailpit
 * locally, Mailtrap on preview, SendGrid in production. `emailTo` falls back
 * to the tenant's generic recipient in site settings instead — seeded
 * alongside this form (see `ensureSiteSetting`'s `forms.notificationRecipients`)
 * so the two exercise that exact fallback rather than fighting it.
 *
 * @param payload - Payload instance
 * @param data - Form data
 * @param options - Seed options
 * @returns The created form or the id if one already exists
 */
export async function ensureForm(
  payload: Payload,
  data: FormData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Form | number> {
  const { locale, transactionID, managedBy } = options;
  const {
    confirmation,
    emailLabel,
    emailTo,
    emailPlaceholder,
    subject,
    submitLabel,
    title,
    tenant
  } = data;

  const forms = await payload.find({
    collection: 'forms',
    where: {
      and: [
        { title: { equals: title } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (forms.totalDocs) {
    return forms.docs[0].id;
  }

  const form = await payload.create({
    collection: 'forms',
    data: {
      ...(managedBy ? { managedBy } : {}),
      title,
      tenant,
      fields: [
        {
          blockType: 'email',
          name: 'email',
          label: emailLabel,
          placeholder: emailPlaceholder,
          width: 6,
          required: true
        }
      ],
      submitButtonLabel: submitLabel,
      confirmationType: 'message',
      confirmationMessage: paragraph(confirmation),
      emails: [
        {
          ...(emailTo ? { emailTo } : {}),
          subject,
          // The plugin expands `{{*:table}}` into every submitted field, so
          // the notification keeps working if the form ever gains one
          message: paragraph('{{*:table}}')
        }
      ]
    },
    locale,
    req: { transactionID }
  });

  return form;
}
