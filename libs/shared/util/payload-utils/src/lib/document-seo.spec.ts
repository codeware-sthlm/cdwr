import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OG_IMAGE_PATH,
  documentSeo,
  ogLocale,
  siteOrigin
} from './document-seo';

describe('documentSeo', () => {
  it('titles a page by its name, or by its SEO title when set', () => {
    expect(documentSeo({ name: 'Om' }).title).toEqual({
      text: 'Om',
      absolute: false
    });
    expect(
      documentSeo({ name: 'Om', meta: { title: 'Om Codeware' } }).title
    ).toEqual({ text: 'Om Codeware', absolute: false });
  });

  it('leaves the front page to the site name, unless it has an SEO title', () => {
    expect(documentSeo({ name: 'Hem' }, { landing: true }).title).toBe(
      undefined
    );
    expect(
      documentSeo(
        { name: 'Hem', meta: { title: 'Codeware' } },
        { landing: true }
      ).title
    ).toEqual({ text: 'Codeware', absolute: true });
  });

  it('keeps an absolute title out of the Open Graph block', () => {
    const landing = documentSeo(
      { name: 'Hem', meta: { title: 'Codeware' } },
      { landing: true }
    );
    expect(landing.openGraph.title).toBeUndefined();
    expect(documentSeo({ name: 'Om' }).openGraph.title).toBe('Om');
  });

  it('describes a page by its SEO description, else its summary', () => {
    expect(
      documentSeo({ name: 'A', meta: { description: 'Från SEO' } }).description
    ).toBe('Från SEO');
    expect(
      documentSeo({ name: 'A', summary: 'Sammanfattning' }).description
    ).toBe('Sammanfattning');
    expect(documentSeo({ name: 'A' }).description).toBeUndefined();
  });

  it('shares a loaded SEO image, else the generated card', () => {
    expect(
      documentSeo({ name: 'A', meta: { image: { url: '/media/a.png' } } })
        .openGraph.image
    ).toBe('/media/a.png');
    expect(
      documentSeo({ name: 'A', meta: { image: 12 } }).openGraph.image
    ).toBe(DEFAULT_OG_IMAGE_PATH);
  });

  it('resolves the canonical link against the origin when given', () => {
    expect(documentSeo({ name: 'Om' }, { path: '/om' }).canonical).toBe('/om');
    expect(
      documentSeo(
        { name: 'Om' },
        { path: '/om', origin: 'https://codeware.se' }
      ).canonical
    ).toBe('https://codeware.se/om');
    expect(documentSeo({ name: 'Om' }).canonical).toBeUndefined();
  });

  it('sets the card type, Open Graph type, site name and locale', () => {
    const seo = documentSeo(
      { name: 'P' },
      { kind: 'article', locale: 'sv', siteName: 'Codeware' }
    );
    expect(seo.twitterCard).toBe('summary_large_image');
    expect(seo.openGraph).toMatchObject({
      type: 'article',
      locale: 'sv_SE',
      siteName: 'Codeware'
    });
  });
});

describe('ogLocale', () => {
  it('maps a known locale and ignores others', () => {
    expect(ogLocale('en')).toBe('en_US');
    expect(ogLocale('sv')).toBe('sv_SE');
    expect(ogLocale('de')).toBeUndefined();
    expect(ogLocale(null)).toBeUndefined();
  });
});

describe('siteOrigin', () => {
  it('takes the scheme the proxy forwarded', () => {
    expect(siteOrigin('codeware.se', 'https')?.origin).toBe(
      'https://codeware.se'
    );
  });

  it('assumes HTTPS for a public host, HTTP for a local one', () => {
    expect(siteOrigin('cdwr.io', null)?.origin).toBe('https://cdwr.io');
    expect(siteOrigin('localhost:3000', null)?.origin).toBe(
      'http://localhost:3000'
    );
  });

  it('gives nothing for a missing or malformed host', () => {
    expect(siteOrigin(null, null)).toBeUndefined();
    expect(siteOrigin('bad host', null)).toBeUndefined();
  });
});
