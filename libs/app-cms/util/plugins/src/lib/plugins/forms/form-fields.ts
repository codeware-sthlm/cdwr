import { managedByField } from '@codeware/app-cms/util/definitions';
import { canEdit } from '@codeware/app-cms/util/misc';
import type { Field } from 'payload';

import { messageEditor } from './message-editor';

/**
 * List-only column linking a form to the submissions it has received.
 *
 * A `ui` field rather than a virtual one: the count is only ever wanted in the
 * list, and a virtual field would resolve on every form read — including the
 * site rendering a form block through a tenant api key.
 */
const submissions: Field = {
  name: 'submissions',
  type: 'ui',
  label: { en: 'Submissions', sv: 'Svar' },
  admin: {
    components: {
      Cell: '@codeware/apps/cms/components/SubmissionCountCell'
    }
  }
};

/**
 * States the tenant's generic notification recipient, or warns there is
 * none, whenever a notification email is left unaddressed.
 *
 * Sits directly above the plugin's own `emails` array — the editor is
 * already looking there when deciding whether to fill in "Email To".
 */
const notificationRecipientHint: Field = {
  name: 'notificationRecipientHint',
  type: 'ui',
  admin: {
    components: {
      Field:
        '@codeware/apps/cms/components/admin/forms/FormNotificationRecipientField'
    }
  }
};

/**
 * Restrict the plugin's own `emails.message` field to the lexical features
 * its email serializer can actually render.
 *
 * Mutates the field in place — the same pattern `customized-fields.ts` uses
 * to patch a nested plugin field, since the plugin builds it once and hands
 * back the same object graph rather than something worth copying.
 */
const restrictMessageEditor = (emailsField: Field): void => {
  if (emailsField.type !== 'array') {
    return;
  }

  const messageField = emailsField.fields.find(
    (field) => 'name' in field && field.name === 'message'
  );
  if (messageField?.type === 'richText') {
    messageField.editor = messageEditor;
  }
};

/**
 * Keep notification recipients out of every read by someone who cannot edit.
 *
 * A form block populates its form into the page, and the site hands the page
 * to the browser, so a recipient read through a tenant api key would reach
 * every visitor. Sending the notification reads the form with override
 * access and still sees them.
 */
const hideRecipients = (emailsField: Field): void => {
  if (emailsField.type !== 'array') {
    return;
  }
  emailsField.access = {
    ...emailsField.access,
    read: ({ req }) => canEdit(req.user)
  };
};

/**
 * Extend the plugin's form fields with our own.
 */
export const formFields = ({
  defaultFields
}: {
  defaultFields: Field[];
}): Field[] => {
  const fields = [...defaultFields, submissions, managedByField()];

  const emailsIndex = defaultFields.findIndex(
    (field) => 'name' in field && field.name === 'emails'
  );
  if (emailsIndex >= 0) {
    fields.splice(emailsIndex, 0, notificationRecipientHint);
    restrictMessageEditor(defaultFields[emailsIndex]);
    hideRecipients(defaultFields[emailsIndex]);
  }

  return fields;
};
