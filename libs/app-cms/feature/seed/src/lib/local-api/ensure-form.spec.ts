import type { Payload } from 'payload';

import { ensureForm } from './ensure-form';

const payloadWith = (found: number) => {
  const created: Array<{ data: Record<string, unknown> }> = [];
  const payload = {
    find: async () => ({ totalDocs: found, docs: [{ id: 7 }] }),
    create: async (args: { data: Record<string, unknown> }) => {
      created.push(args);
      return { id: 8, ...args.data };
    }
  } as unknown as Payload;
  return { payload, created };
};

const common = {
  title: 'Interest',
  submitLabel: 'Send',
  confirmation: 'Thanks',
  subject: 'From {{email}}'
};
const options = { locale: 'sv' as const, transactionID: 't1' };

describe('ensureForm', () => {
  it('builds the single email field when the form states none', async () => {
    const { payload, created } = payloadWith(0);

    await ensureForm(
      payload,
      { ...common, emailLabel: 'Email', emailPlaceholder: 'a@b.se' },
      options
    );

    expect(created[0].data.fields).toEqual([
      {
        blockType: 'email',
        name: 'email',
        label: 'Email',
        placeholder: 'a@b.se',
        width: 6,
        required: true
      }
    ]);
  });

  it('uses the fields a form states, verbatim', async () => {
    const { payload, created } = payloadWith(0);
    const fields = [
      { blockType: 'text' as const, name: 'name', label: 'Name', width: 6 },
      { blockType: 'email' as const, name: 'email', label: 'Email' }
    ];

    await ensureForm(payload, { ...common, fields }, options);

    expect(created[0].data.fields).toEqual(fields);
  });

  it('leaves an existing form alone', async () => {
    const { payload, created } = payloadWith(1);

    const result = await ensureForm(
      payload,
      { ...common, emailLabel: 'Email', emailPlaceholder: 'a@b.se' },
      options
    );

    expect(result).toBe(7);
    expect(created).toHaveLength(0);
  });
});
