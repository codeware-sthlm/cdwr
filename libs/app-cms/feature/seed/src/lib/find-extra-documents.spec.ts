import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import { findExtraDocuments } from './find-extra-documents';

/** A Payload whose `find` answers from a per-collection table. */
const payloadWith = (tables: Record<string, Array<Record<string, unknown>>>) =>
  ({
    find: async ({ collection }: { collection: string }) => ({
      docs: tables[collection] ?? []
    })
  }) as unknown as Payload;

const definition: SiteDefinition = {
  name: 'test',
  tags: [{ name: 'News', slug: 'news' }],
  media: [{ filename: 'logo', alt: 'Logo', filePath: '/logo.png' }],
  pages: [{ name: 'Home', slug: 'home', layout: [] }]
};

describe('findExtraDocuments', () => {
  it('reports a document the definition does not name', async () => {
    const payload = payloadWith({
      pages: [
        { id: 1, slug: 'home' },
        { id: 2, slug: 'christmas-offer' }
      ]
    });

    const extra = await findExtraDocuments(payload, definition, 7);

    expect(extra).toEqual([
      { collection: 'pages', identifier: 'christmas-offer', id: 2 }
    ]);
  });

  it('says nothing about a document the definition names', async () => {
    const payload = payloadWith({
      pages: [{ id: 1, slug: 'home' }],
      tags: [{ id: 3, slug: 'news' }]
    });

    await expect(findExtraDocuments(payload, definition, 7)).resolves.toEqual(
      []
    );
  });

  it('matches media on the stem, since an upload may rename the file', async () => {
    const payload = payloadWith({
      pages: [{ id: 1, slug: 'home' }],
      media: [
        { id: 4, filename: 'logo.png' },
        { id: 5, filename: 'unrelated.png' }
      ]
    });

    const extra = await findExtraDocuments(payload, definition, 7);

    expect(extra).toEqual([
      { collection: 'media', identifier: 'unrelated.png', id: 5 }
    ]);
  });

  it('looks at every collection a definition can state', async () => {
    const payload = payloadWith({
      tags: [{ id: 1, slug: 'stray-tag' }],
      categories: [{ id: 2, slug: 'stray-category' }],
      media: [{ id: 3, filename: 'stray.png' }],
      forms: [{ id: 4, title: 'Stray' }],
      pages: [{ id: 5, slug: 'stray-page' }],
      posts: [{ id: 6, slug: 'stray-post' }]
    });

    const extra = await findExtraDocuments(payload, definition, 7);

    expect(extra.map(({ collection }) => collection)).toEqual([
      'tags',
      'categories',
      'media',
      'forms',
      'pages',
      'posts'
    ]);
  });

  it('skips a document whose lookup field is missing', async () => {
    const payload = payloadWith({
      pages: [{ id: 1, slug: 'home' }, { id: 2 }]
    });

    await expect(findExtraDocuments(payload, definition, 7)).resolves.toEqual(
      []
    );
  });
});
