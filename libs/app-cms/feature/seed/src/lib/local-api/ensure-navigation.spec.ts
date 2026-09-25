import type { Payload } from 'payload';

import { ensureNavigation } from './ensure-navigation';

type Item = { id?: string; reference?: { relationTo: 'pages'; value: number } };

/** A Payload holding one tenant's navigation, recording what is written. */
const payloadWith = (stored: Array<Item> | null) => {
  const calls = { create: 0, update: [] as Array<Array<Item>> };
  const payload = {
    find: async () =>
      stored === null
        ? { totalDocs: 0, docs: [] }
        : { totalDocs: 1, docs: [{ id: 9, items: stored }] },
    update: async ({ data }: { data: { items: Array<Item> } }) => {
      calls.update.push(data.items);
      return {};
    },
    create: async () => {
      calls.create += 1;
      return { id: 10 };
    }
  } as unknown as Payload;
  return { payload, calls };
};

const options = { locale: 'en' as const, transactionID: undefined };
const page = (value: number) => ({
  reference: { relationTo: 'pages' as const, value }
});

describe('ensureNavigation', () => {
  it('updates the existing navigation when every stored item is dangling', async () => {
    // The pages were deleted, so every row lost its reference. Falling through
    // to create would give the tenant a second navigation
    const { payload, calls } = payloadWith([{ id: 'a' }, { id: 'b' }]);

    await ensureNavigation(payload, { tenant: 1, items: [page(3)] }, options);

    expect(calls.create).toBe(0);
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].map((item) => item.reference?.value)).toEqual([3]);
  });

  it('drops a dangling item even when nothing new is added', async () => {
    const { payload, calls } = payloadWith([page(3), { id: 'gone' }]);

    await ensureNavigation(payload, { tenant: 1, items: [page(3)] }, options);

    expect(calls.update[0].map((item) => item.reference?.value)).toEqual([3]);
  });

  it('writes nothing when the navigation already matches', async () => {
    const { payload, calls } = payloadWith([page(3)]);

    await ensureNavigation(payload, { tenant: 1, items: [page(3)] }, options);

    expect(calls).toEqual({ create: 0, update: [] });
  });

  it('creates one only when the tenant has none', async () => {
    const { payload, calls } = payloadWith(null);

    await ensureNavigation(payload, { tenant: 1, items: [page(3)] }, options);

    expect(calls.create).toBe(1);
  });
});
