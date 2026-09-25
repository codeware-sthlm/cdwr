import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { removeManagedDocuments } from './remove-managed-documents';

type Doc = Record<string, unknown> & { id: number; managedBy?: string | null };

/**
 * A Payload whose `find` honours the `managedBy` condition the way the
 * database would, and records every delete in order.
 */
const payloadWith = (tables: Record<string, Array<Doc>>) => {
  const deleted: Array<string> = [];
  const payload = {
    find: async ({
      collection,
      where
    }: {
      collection: string;
      where: { and: Array<{ managedBy?: { equals: string } }> };
    }) => {
      const owner = where.and.find((c) => c.managedBy)?.managedBy?.equals;
      return {
        docs: (tables[collection] ?? []).filter((d) => d.managedBy === owner)
      };
    },
    delete: async ({ collection, id }: { collection: string; id: number }) => {
      deleted.push(`${collection}:${id}`);
      return {};
    }
  } as unknown as Payload;
  return { payload, deleted };
};

const definition = { name: 'cdwr.io', pages: [] } as unknown as SiteDefinition;
const options = { transactionID: 'tx' };

describe('removeManagedDocuments', () => {
  it("removes only this definition's documents, never an editor's or another's", async () => {
    const { payload, deleted } = payloadWith({
      pages: [
        { id: 1, slug: 'home', managedBy: 'cdwr.io' },
        { id: 2, slug: 'written-by-hand', managedBy: null },
        { id: 3, slug: 'moon-page', managedBy: 'moon' }
      ]
    });

    const removed = await removeManagedDocuments(
      payload,
      definition,
      7,
      options
    );

    expect(deleted).toEqual(['pages:1']);
    expect(removed).toEqual([
      { collection: 'pages', identifier: 'home', id: 1 }
    ]);
  });

  it('removes what points at a document before the document itself', async () => {
    const mine = { managedBy: 'cdwr.io' };
    const { payload, deleted } = payloadWith({
      tags: [{ id: 1, slug: 't', ...mine }],
      categories: [{ id: 2, slug: 'c', ...mine }],
      media: [{ id: 3, filename: 'm.png', ...mine }],
      forms: [{ id: 4, title: 'Contact', ...mine }],
      pages: [{ id: 5, slug: 'p', ...mine }],
      posts: [{ id: 6, slug: 'q', ...mine }]
    });

    await removeManagedDocuments(payload, definition, 7, options);

    expect(deleted).toEqual([
      'posts:6',
      'pages:5',
      'forms:4',
      'media:3',
      'categories:2',
      'tags:1'
    ]);
  });

  it('names each document the way the extra-document report does', async () => {
    const { payload } = payloadWith({
      media: [{ id: 3, filename: 'hero.png', managedBy: 'cdwr.io' }],
      forms: [{ id: 4, title: 'Contact', managedBy: 'cdwr.io' }]
    });

    const removed = await removeManagedDocuments(
      payload,
      definition,
      7,
      options
    );

    expect(removed.map(({ identifier }) => identifier)).toEqual([
      'Contact',
      'hero.png'
    ]);
  });
});
