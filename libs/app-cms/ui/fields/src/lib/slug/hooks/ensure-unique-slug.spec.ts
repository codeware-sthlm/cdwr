import type { Payload, PayloadRequest } from 'payload';

import { ensureUniqueSlug } from './ensure-unique-slug';

/** A request whose payload records the `req` each query was given. */
const requestWith = (taken: boolean) => {
  const seen: Array<unknown> = [];
  const payload = {
    logger: { warn: () => undefined },
    find: async ({ req }: { req?: unknown }) => {
      seen.push(req);
      return { docs: taken ? [{ id: 2 }] : [] };
    },
    findByID: async ({ req }: { req?: unknown }) => {
      seen.push(req);
      return { name: 'cdwr.io' };
    }
  } as unknown as Payload;
  const req = { payload, transactionID: 'tx' } as unknown as PayloadRequest;
  return { req, seen };
};

const collection = {
  slug: 'pages',
  fields: [
    { name: 'slug', type: 'text' },
    { name: 'tenant', type: 'relationship', relationTo: 'tenants' }
  ]
};

const run = (req: PayloadRequest) =>
  ensureUniqueSlug({
    collection,
    data: { tenant: 19 },
    originalDoc: {},
    req,
    value: 'home'
  } as unknown as Parameters<typeof ensureUniqueSlug>[0]);

describe('ensureUniqueSlug', () => {
  it("looks for a duplicate inside the caller's transaction", async () => {
    // Outside it, a slug the same transaction just freed still reads as
    // taken — which failed every fresh apply that recreates a document
    const { req, seen } = requestWith(false);

    await expect(run(req)).resolves.toBe('home');
    expect(seen).toEqual([req]);
  });

  it('reads the workspace name for its error inside the transaction too', async () => {
    const { req, seen } = requestWith(true);

    await expect(run(req)).rejects.toThrow();
    expect(seen).toEqual([req, req]);
  });
});
