/** One address a sitemap lists */
export type SitemapEntry = {
  /** Absolute */
  url: string;
  /** When the document last changed, as the cms states it */
  lastModified?: string | null;
};

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
 * An address listed twice, such as a page that is also the landing page, is
 * listed once, at its first place.
 */
export function sitemapXml(entries: ReadonlyArray<SitemapEntry>): string {
  const seen = new Set<string>();
  const urls = entries.flatMap(({ url, lastModified }) => {
    if (seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [
      `  <url>\n    <loc>${escapeXml(url)}</loc>${
        lastModified
          ? `\n    <lastmod>${escapeXml(lastModified)}</lastmod>`
          : ''
      }\n  </url>`
    ];
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}

/**
 * What crawlers are told about the site.
 *
 * A gated site keeps them out altogether; an open one welcomes them and names
 * its sitemap when its own origin is known.
 */
export function robotsTxt({
  gated,
  origin
}: {
  gated: boolean;
  origin?: string | null;
}): string {
  if (gated) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return [
    'User-agent: *',
    'Allow: /',
    ...(origin ? [`Sitemap: ${origin}/sitemap.xml`] : []),
    ''
  ].join('\n');
}
