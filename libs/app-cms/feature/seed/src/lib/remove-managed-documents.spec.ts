import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import type { ExtraDocument } from './find-extra-documents';
import {
  droppedReusedDocuments,
  removeRecreatedDocuments
} from './remove-managed-documents';

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
const mine = { managedBy: 'cdwr.io' };

describe('removeRecreatedDocuments', () => {
  it("removes only this definition's documents, never an editor's or another's", async () => {
    const { payload, deleted } = payloadWith({
      pages: [
        { id: 1, slug: 'home', ...mine },
        { id: 2, slug: 'written-by-hand', managedBy: null },
        { id: 3, slug: 'moon-page', managedBy: 'moon' }
      ]
    });

    const removed = await removeRecreatedDocuments(
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
    const { payload, deleted } = payloadWith({
      categories: [{ id: 2, slug: 'c', ...mine }],
      forms: [{ id: 4, title: 'Contact', ...mine }],
      pages: [{ id: 5, slug: 'p', ...mine }],
      posts: [{ id: 6, slug: 'q', ...mine }]
    });

    await removeRecreatedDocuments(payload, definition, 7, options);

    expect(deleted).toEqual(['posts:6', 'pages:5', 'forms:4', 'categories:2']);
  });

  it('never deletes media or tags, which a fresh apply reuses', async () => {
    // Media holds a file a rollback cannot bring back, and reused media points
    // at tags by id — so neither is removed up front
    const { payload, deleted } = payloadWith({
      tags: [{ id: 1, slug: 't', ...mine }],
      media: [{ id: 3, filename: 'm.png', ...mine }]
    });

    await removeRecreatedDocuments(payload, definition, 7, options);

    expect(deleted).toEqual([]);
  });

  it('leaves a page the caller is handing over', async () => {
    const { payload, deleted } = payloadWith({
      pages: [
        { id: 1, slug: 'home', ...mine },
        { id: 2, slug: 'studio', ...mine }
      ]
    });

    await removeRecreatedDocuments(payload, definition, 7, {
      ...options,
      exceptPages: [1]
    });

    expect(deleted).toEqual(['pages:2']);
  });

  it('names each document the way the extra-document report does', async () => {
    const { payload } = payloadWith({
      forms: [{ id: 4, title: 'Contact', ...mine }],
      categories: [{ id: 2, slug: 'themes', ...mine }]
    });

    const removed = await removeRecreatedDocuments(
      payload,
      definition,
      7,
      options
    );

    expect(removed.map(({ identifier }) => identifier)).toEqual([
      'Contact',
      'themes'
    ]);
  });
});

describe('droppedReusedDocuments', () => {
  const extra = (
    collection: string,
    owner: ExtraDocument['owner']
  ): ExtraDocument => ({
    collection,
    identifier: `${collection}-${owner}`,
    id: 1,
    managedBy: owner === 'nobody' ? null : 'x',
    owner
  });

  it('takes only what this definition created and dropped, in reused collections', () => {
    const dropped = droppedReusedDocuments([
      extra('media', 'this-definition'),
      extra('tags', 'this-definition'),
      // Recreated collections are handled up front, not here
      extra('pages', 'this-definition'),
      // Never this definition's to remove
      extra('media', 'nobody'),
      extra('tags', 'another-definition')
    ]);

    expect(dropped.map(({ identifier }) => identifier)).toEqual([
      'media-this-definition',
      'tags-this-definition'
    ]);
  });
});
