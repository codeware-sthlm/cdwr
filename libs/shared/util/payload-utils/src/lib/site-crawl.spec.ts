import { describe, expect, it } from 'vitest';

import { robotsRules, sitemapEntries } from './site-crawl';

describe('sitemapEntries', () => {
  const origin = 'https://moon.example';

  it('lists pages at the root, posts and tours under their collection', () => {
    expect(
      sitemapEntries({
        pages: [{ id: 2, slug: 'om', updatedAt: '2026-01-02T03:04:05.000Z' }],
        posts: [{ id: 3, slug: 'nyheter' }],
        tours: [{ id: 4, slug: 'fjallen', updatedAt: null }],
        origin
      })
    ).toEqual([
      {
        url: 'https://moon.example/om',
        lastModified: '2026-01-02T03:04:05.000Z'
      },
      { url: 'https://moon.example/posts/nyheter', lastModified: undefined },
      { url: 'https://moon.example/tours/fjallen', lastModified: null }
    ]);
  });

  it('lists the landing page at the root', () => {
    expect(
      sitemapEntries({
        pages: [{ id: 1, slug: 'hem' }],
        posts: [],
        tours: [],
        landingId: 1,
        origin
      }).map(({ url }) => url)
    ).toEqual(['https://moon.example/']);
  });

  it('lists an address once, at its first place', () => {
    expect(
      sitemapEntries({
        pages: [
          { id: 1, slug: 'hem', updatedAt: 'first' },
          { id: 2, slug: '', updatedAt: 'second' }
        ],
        posts: [],
        tours: [],
        landingId: 1,
        origin
      })
    ).toEqual([{ url: 'https://moon.example/', lastModified: 'first' }]);
  });

  it('lists nothing without documents', () => {
    expect(sitemapEntries({ pages: [], posts: [], tours: [], origin })).toEqual(
      []
    );
  });
});

describe('robotsRules', () => {
  it('keeps crawlers out of a gated site', () => {
    expect(
      robotsRules({
        gated: true,
        disallow: ['/admin'],
        origin: 'https://moon.example'
      })
    ).toEqual({ disallow: ['/'] });
  });

  it('welcomes crawlers to an open site and names the sitemap', () => {
    expect(
      robotsRules({ gated: false, origin: 'https://moon.example' })
    ).toEqual({
      allow: '/',
      disallow: [],
      sitemap: 'https://moon.example/sitemap.xml'
    });
  });

  it('keeps out what the app serves besides the site', () => {
    expect(robotsRules({ gated: false, disallow: ['/admin'] })).toEqual({
      allow: '/',
      disallow: ['/admin']
    });
  });

  it('names no sitemap when the origin is unknown', () => {
    expect(robotsRules({ gated: false, origin: null })).toEqual({
      allow: '/',
      disallow: []
    });
  });
});
