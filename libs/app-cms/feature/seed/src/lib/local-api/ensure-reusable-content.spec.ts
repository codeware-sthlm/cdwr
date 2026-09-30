import type { Payload } from 'payload';

import { ensureReusableContent } from './ensure-reusable-content';

const layout = [{ blockType: 'code' as const, id: null, code: 'hi' }];

const payloadWith = (found: number) => {
  const created: Array<Record<string, unknown>> = [];
  const payload = {
    find: async () => ({ totalDocs: found, docs: [{ id: 7 }] }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return { id: 8, ...data };
    }
  } as unknown as Payload;
  return { payload, created };
};

describe('ensureReusableContent', () => {
  it('creates a document with the stated layout', async () => {
    const { payload, created } = payloadWith(0);

    await ensureReusableContent(
      payload,
      { title: 'Shared', layout, tenant: 1 },
      { locale: 'en', transactionID: undefined, managedBy: 'cdwr.io' }
    );

    expect(created[0]).toMatchObject({
      managedBy: 'cdwr.io',
      title: 'Shared',
      layout
    });
  });

  it('leaves a document the tenant already has, by title, alone', async () => {
    const { payload, created } = payloadWith(1);

    const result = await ensureReusableContent(
      payload,
      { title: 'Shared', layout, tenant: 1 },
      { locale: 'en', transactionID: undefined }
    );

    expect(result).toBe(7);
    expect(created).toEqual([]);
  });
});
