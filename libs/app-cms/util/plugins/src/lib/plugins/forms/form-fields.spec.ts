import type { Field } from 'payload';
import { describe, expect, it } from 'vitest';

import { formFields } from './form-fields';
import { messageEditor } from './message-editor';

/** Mirrors the plugin's own `emails` array field, minus the parts unused here */
const emailsField: Field = {
  name: 'emails',
  type: 'array',
  fields: [
    { name: 'emailTo', type: 'text' },
    { name: 'subject', type: 'text' },
    { name: 'message', type: 'richText' }
  ]
};

const defaultFields: Array<Field> = [
  { name: 'title', type: 'text' },
  emailsField,
  { name: 'confirmationType', type: 'radio', options: [] }
];

describe('formFields', () => {
  it('inserts the notification hint directly before emails', () => {
    const fields = formFields({ defaultFields });

    const names = fields.map((field) =>
      'name' in field ? field.name : field.type
    );
    expect(names).toEqual([
      'title',
      'notificationRecipientHint',
      'emails',
      'confirmationType',
      'submissions',
      // Which site definition created the form, like every document an apply owns
      'managedBy'
    ]);
  });

  it("restricts the emails array's message field to the email-safe editor", () => {
    formFields({ defaultFields });

    const messageField = emailsField.fields.find(
      (field) => 'name' in field && field.name === 'message'
    );
    expect(
      messageField && 'editor' in messageField && messageField.editor
    ).toBe(messageEditor);
  });

  it.each([
    ['nobody', null, false],
    ['a tenant api key', { id: 1, slug: 'acme', apiKey: 'k' }, false],
    [
      'a reader',
      { id: 2, role: 'user', tenants: [{ tenant: 1, role: 'reader' }] },
      false
    ],
    [
      'an editor',
      { id: 3, role: 'user', tenants: [{ tenant: 1, role: 'user' }] },
      true
    ],
    ['a system user', { id: 4, role: 'system-user', tenants: [] }, true]
  ])('lets %s read the recipients: %s', (_, user, allowed) => {
    formFields({ defaultFields });

    const read =
      emailsField.type === 'array' ? emailsField.access?.read : undefined;
    expect(read?.({ req: { user } } as never)).toBe(allowed);
  });

  it('leaves other array fields alone when there is no message field', () => {
    const noMessage: Field = {
      name: 'emails',
      type: 'array',
      fields: [{ name: 'emailTo', type: 'text' }]
    };

    expect(() => formFields({ defaultFields: [noMessage] })).not.toThrow();
  });

  it('does nothing when the plugin ships no emails field at all', () => {
    const fields = formFields({
      defaultFields: [{ name: 'title', type: 'text' }]
    });

    expect(
      fields.map((field) => ('name' in field ? field.name : field.type))
    ).toEqual(['title', 'submissions', 'managedBy']);
  });
});
