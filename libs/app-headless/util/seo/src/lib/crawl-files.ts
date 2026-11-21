import {
  type SitemapEntry,
  robotsRules
} from '@codeware/shared/util/payload-utils';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

/**
 * The sitemap protocol's document for the given addresses.
 *
 * Lists what it is given: `sitemapEntries` has already listed each address once.
 */
export function sitemapXml(entries: ReadonlyArray<SitemapEntry>): string {
  const urls = entries.map(
    ({ url, lastModified }) =>
      `  <url>\n    <loc>${escapeXml(url)}</loc>${
        lastModified
          ? `\n    <lastmod>${escapeXml(lastModified)}</lastmod>`
          : ''
      }\n  </url>`
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}

/**
 * What crawlers are told about the site, as robots.txt.
 *
 * The rules are `robotsRules`; this only writes them out.
 */
export function robotsTxt(options: {
  gated: boolean;
  origin?: string | null;
}): string {
  const { allow, disallow, sitemap } = robotsRules(options);

  return [
    'User-agent: *',
    ...(allow ? [`Allow: ${allow}`] : []),
    ...disallow.map((path) => `Disallow: ${path}`),
    ...(sitemap ? [`Sitemap: ${sitemap}`] : []),
    ''
  ].join('\n');
}
