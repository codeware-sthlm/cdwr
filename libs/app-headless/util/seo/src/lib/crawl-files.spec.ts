import { robotsTxt, sitemapXml } from './crawl-files';

describe('robotsTxt', () => {
  it('keeps crawlers out of a gated site', () => {
    expect(robotsTxt({ gated: true, origin: 'https://moon.example' })).toBe(
      'User-agent: *\nDisallow: /\n'
    );
  });

  it('welcomes crawlers to an open site and names the sitemap', () => {
    expect(robotsTxt({ gated: false, origin: 'https://moon.example' })).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://moon.example/sitemap.xml\n'
    );
  });
});

describe('sitemapXml', () => {
  it('is an empty urlset without entries', () => {
    expect(sitemapXml([])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
    );
  });

  it('lists each address with its last change', () => {
    const xml = sitemapXml([
      {
        url: 'https://moon.example/',
        lastModified: '2026-01-02T03:04:05.000Z'
      },
      { url: 'https://moon.example/om' }
    ]);

    expect(xml).toContain(
      '<loc>https://moon.example/</loc>\n    <lastmod>2026-01-02T03:04:05.000Z</lastmod>'
    );
    expect(xml).toContain('<loc>https://moon.example/om</loc>\n  </url>');
  });

  it('escapes what XML reserves', () => {
    expect(sitemapXml([{ url: 'https://moon.example/a?b=1&c=<2>' }])).toContain(
      '<loc>https://moon.example/a?b=1&amp;c=&lt;2&gt;</loc>'
    );
  });
});
