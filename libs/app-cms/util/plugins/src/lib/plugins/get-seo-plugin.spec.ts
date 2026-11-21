import { generateSeoURL } from './get-seo-plugin';

type Args = Parameters<typeof generateSeoURL>[0];

const call = (
  collectionSlug: string,
  doc: Record<string, unknown>,
  landingPage: number | null = null
) =>
  generateSeoURL({
    collectionSlug,
    doc,
    req: {
      origin: 'https://example.com',
      payload: {
        find: async () => ({
          docs: landingPage === null ? [] : [{ general: { landingPage } }]
        })
      }
    }
  } as unknown as Args);

describe('generateSeoURL', () => {
  it('addresses a page at its slug', async () => {
    expect(await call('pages', { id: 2, slug: 'om', tenant: 1 }, 1)).toBe(
      'https://example.com/om'
    );
  });

  it('addresses the landing page at the root', async () => {
    expect(await call('pages', { id: 1, slug: 'hem', tenant: 1 }, 1)).toBe(
      'https://example.com/'
    );
  });

  it('addresses posts and tours under their collection', async () => {
    expect(await call('posts', { slug: 'nyhet' })).toBe(
      'https://example.com/posts/nyhet'
    );
    expect(await call('tours', { slug: 'a' })).toBe(
      'https://example.com/tours/a'
    );
  });
});
