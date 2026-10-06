import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import type { ExtraDocument } from './find-extra-documents';
import {
  droppedReusedDocuments,
  refuseFormsWithSubmissions,
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
      posts: [{ id: 6, slug: 'q', ...mine }],
      'reusable-content': [{ id: 8, title: 'Shared', ...mine }]
    });

    await removeRecreatedDocuments(payload, definition, 7, options);

    expect(deleted).toEqual([
      'posts:6',
      'pages:5',
      'reusable-content:8',
      'forms:4',
      'categories:2'
    ]);
  });

  it('never deletes media, tags, places or tours up front', async () => {
    // Media holds a file a rollback cannot bring back, and reused media points
    // at tags by id. Tours carry bookings, and places are what tours point at
    const { payload, deleted } = payloadWith({
      tags: [{ id: 1, slug: 't', ...mine }],
      media: [{ id: 3, filename: 'm.png', ...mine }],
      places: [{ id: 9, name: 'The Hut', ...mine }],
      tours: [{ id: 10, slug: 'a-tour', ...mine }]
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
      // Kept collections are never removed
      extra('places', 'this-definition'),
      extra('tours', 'this-definition'),
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

describe('refuseFormsWithSubmissions', () => {
  /** Forms as `payloadWith` holds them, and submissions counted per form id */
  const payloadCounting = (
    forms: Array<Doc>,
    submissions: Record<number, number>
  ) => {
    const { payload } = payloadWith({ forms });
    Object.assign(payload, {
      count: async ({ where }: { where: { form: { equals: number } } }) => ({
        totalDocs: submissions[where.form.equals] ?? 0
      })
    });
    return payload;
  };

  it('names each form of this definition that has submissions, with its count', async () => {
    const payload = payloadCounting(
      [
        { id: 1, title: 'Contact', ...mine },
        { id: 2, title: 'Newsletter', ...mine },
        { id: 3, title: 'Unanswered', ...mine }
      ],
      { 1: 4, 2: 1 }
    );

    const refused = refuseFormsWithSubmissions(payload, definition, 7, options);

    await expect(refused).rejects.toThrow(
      'A fresh apply would recreate 2 form(s) that have submissions'
    );
    await expect(refused).rejects.toThrow('  Contact (4 submission(s))');
    await expect(refused).rejects.toThrow('  Newsletter (1 submission(s))');
    await expect(refused).rejects.not.toThrow('Unanswered');
  });

  it("ignores another definition's or an editor's form, which a fresh apply never removes", async () => {
    const payload = payloadCounting(
      [
        { id: 1, title: 'Moon contact', managedBy: 'moon' },
        { id: 2, title: 'By hand', managedBy: null }
      ],
      { 1: 3, 2: 3 }
    );

    await expect(
      refuseFormsWithSubmissions(payload, definition, 7, options)
    ).resolves.toBeUndefined();
  });
});
