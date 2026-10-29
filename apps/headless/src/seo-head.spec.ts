import { documentSeo } from '@codeware/shared/util/payload-utils';
import { describe, expect, it } from 'vitest';

import { seoHead } from './seo-head';

const ORIGIN = 'https://codeware.se';

describe('seoHead', () => {
  it('titles a page in the site template, with its card and canonical link', () => {
    const head = seoHead(
      documentSeo(
        { name: 'About', meta: { description: 'Who we are' } },
        { siteName: 'Codeware', path: '/about', origin: ORIGIN, locale: 'sv' }
      ),
      'Codeware',
      ORIGIN
    );

    expect(head.meta).toEqual([
      { title: 'About · Codeware' },
      { name: 'description', content: 'Who we are' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Codeware' },
      { property: 'og:locale', content: 'sv_SE' },
      { property: 'og:title', content: 'About' },
      { property: 'og:description', content: 'Who we are' },
      { property: 'og:image', content: 'https://codeware.se/og-image.png' },
      { property: 'og:url', content: 'https://codeware.se/about' },
      { name: 'twitter:card', content: 'summary_large_image' }
    ]);
    expect(head.links).toEqual([
      { rel: 'canonical', href: 'https://codeware.se/about' }
    ]);
  });

  it('gives the landing page the site name alone', () => {
    const head = seoHead(
      documentSeo({ name: 'Home' }, { landing: true, path: '/' }),
      'Codeware'
    );

    expect(head.meta[0]).toEqual({ title: 'Codeware' });
  });

  it('lets an SEO title on the landing page stand alone', () => {
    const head = seoHead(
      documentSeo(
        { name: 'Home', meta: { title: 'Codeware: software, built well' } },
        { landing: true }
      ),
      'Codeware'
    );

    expect(head.meta[0]).toEqual({ title: 'Codeware: software, built well' });
  });

  it('marks a post as an article and keeps its own image', () => {
    const head = seoHead(
      documentSeo(
        { name: 'News', meta: { image: { url: '/media/news.jpg' } } },
        { kind: 'article' }
      ),
      'Codeware',
      ORIGIN
    );

    expect(head.meta).toContainEqual({
      property: 'og:type',
      content: 'article'
    });
    expect(head.meta).toContainEqual({
      property: 'og:image',
      content: 'https://codeware.se/media/news.jpg'
    });
    expect(head.links).toEqual([]);
  });
});
