import type { Payload } from 'payload';

import { ensureNavigation } from './ensure-navigation';

type Item = {
  id?: string;
  reference?: { relationTo: 'pages'; value: number };
  appearance?: 'link' | 'button';
  type?: 'link' | 'group';
  label?: string;
  children?: Array<{ reference?: { relationTo: 'pages'; value: number } }>;
};

/** A Payload holding one tenant's navigation, recording what is written. */
const payloadWith = (stored: Array<Item> | null) => {
  const calls = {
    create: 0,
    created: [] as Array<Item>,
    update: [] as Array<Array<Item>>
  };
  const payload = {
    find: async () =>
      stored === null
        ? { totalDocs: 0, docs: [] }
        : { totalDocs: 1, docs: [{ id: 9, items: stored }] },
    update: async ({ data }: { data: { items: Array<Item> } }) => {
      calls.update.push(data.items);
      return {};
    },
    create: async ({ data }: { data: { items: Array<Item> } }) => {
      calls.create += 1;
      calls.created = data.items;
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

    expect(calls).toEqual({ create: 0, created: [], update: [] });
  });

  it('creates one only when the tenant has none', async () => {
    const { payload, calls } = payloadWith(null);

    await ensureNavigation(payload, { tenant: 1, items: [page(3)] }, options);

    expect(calls.create).toBe(1);
  });

  it('carries the appearance and defaults it to a link', async () => {
    const { payload, calls } = payloadWith(null);

    await ensureNavigation(
      payload,
      { tenant: 1, items: [page(3), { ...page(4), appearance: 'button' }] },
      options
    );

    expect(calls.created.map((item) => item.appearance)).toEqual([
      'link',
      'button'
    ]);
  });

  it('leaves an existing item as it is unless the definition wins', async () => {
    // A stored `link` may be an editor's choice, so a normal apply keeps it
    const stored = [{ ...page(3), appearance: 'link' as const }];
    const wanted = [{ ...page(3), appearance: 'button' as const }];

    const normal = payloadWith(stored);
    await ensureNavigation(
      normal.payload,
      { tenant: 1, items: wanted },
      options
    );
    expect(normal.calls.update).toEqual([]);

    const fresh = payloadWith(stored);
    await ensureNavigation(
      fresh.payload,
      { tenant: 1, items: wanted },
      { ...options, definitionWins: true }
    );
    expect(fresh.calls.update[0].map((item) => item.appearance)).toEqual([
      'button'
    ]);
  });

  describe('groups', () => {
    const group = (...values: Array<number>) => ({
      label: 'Explore',
      children: values.map((value) => page(value))
    });
    const storedGroup = (...values: Array<number>) => ({
      type: 'group' as const,
      ...group(...values)
    });

    it('appends a group the navigation lacks', async () => {
      const { payload, calls } = payloadWith([page(3)]);

      await ensureNavigation(
        payload,
        { tenant: 1, items: [page(3), group(4, 5)] },
        options
      );

      expect(calls.update[0]).toHaveLength(2);
      expect(calls.update[0][1]).toMatchObject({
        type: 'group',
        label: 'Explore'
      });
      expect(
        calls.update[0][1].children?.map((child) => child.reference?.value)
      ).toEqual([4, 5]);
    });

    it('matches a group by label and keeps its links unless the definition wins', async () => {
      const { payload, calls } = payloadWith([storedGroup(4)]);

      await ensureNavigation(
        payload,
        { tenant: 1, items: [group(4, 5)] },
        options
      );

      expect(calls.update).toEqual([]);
    });

    it('drops a child whose page is gone, and the group once none is left', async () => {
      const { payload, calls } = payloadWith([
        {
          type: 'group',
          label: 'Explore',
          children: [page(4), { id: 'gone' }]
        },
        { type: 'group', label: 'Empty', children: [{ id: 'gone' }] }
      ]);

      await ensureNavigation(
        payload,
        { tenant: 1, items: [group(4)] },
        options
      );

      expect(calls.update).toHaveLength(1);
      expect(calls.update[0]).toHaveLength(1);
      expect(
        calls.update[0][0].children?.map((child) => child.reference?.value)
      ).toEqual([4]);
    });

    it('replaces a matched groups links when the definition wins', async () => {
      const { payload, calls } = payloadWith([storedGroup(4)]);

      await ensureNavigation(
        payload,
        { tenant: 1, items: [group(5, 6)] },
        { ...options, definitionWins: true }
      );

      expect(calls.update).toHaveLength(1);
      expect(
        calls.update[0][0].children?.map((child) => child.reference?.value)
      ).toEqual([5, 6]);
    });
  });
});
