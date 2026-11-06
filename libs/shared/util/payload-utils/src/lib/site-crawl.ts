import { sitePath } from './site-path';

/** Most documents of a kind a sitemap lists; the protocol allows 50 000 URLs */
export const SITEMAP_LIMIT = 5000;

/** One address a sitemap lists */
export type SitemapEntry = {
  /** Absolute */
  url: string;
  /** When the document last changed, as the cms states it */
  lastModified?: string | null;
};

/** What a sitemap reads of a document: its address and its last change */
type CrawledDoc = {
  id?: number | string | null;
  slug?: string | null;
  updatedAt?: string | null;
};

/**
 * The addresses a sitemap lists for the site's pages, posts and tours.
 *
 * Fetching is the caller's: pass only what a crawler may see. An address
 * listed twice, such as a page that is also the landing page, is listed once,
 * at its first place.
 *
 * @param landingId - The tenant's landing page, which answers at `/`
 * @param origin - The address the site calls its own, so the list names one
 *   host whichever one the crawler came in on
 */
export function sitemapEntries({
  pages,
  posts,
  tours,
  landingId,
  origin
}: {
  pages: ReadonlyArray<CrawledDoc>;
  posts: ReadonlyArray<CrawledDoc>;
  tours: ReadonlyArray<CrawledDoc>;
  landingId?: number | string | null;
  origin: string;
}): Array<SitemapEntry> {
  const paths = [
    ...pages.map((doc) => ({ path: sitePath('pages', doc, landingId), doc })),
    ...posts.map((doc) => ({ path: sitePath('posts', doc), doc })),
    ...tours.map((doc) => ({ path: sitePath('tours', doc), doc }))
  ];

  const seen = new Set<string>();
  return paths.flatMap(({ path, doc }) => {
    if (seen.has(path)) {
      return [];
    }
    seen.add(path);
    return [
      { url: new URL(path, origin).toString(), lastModified: doc.updatedAt }
    ];
  });
}

/** What robots.txt tells every crawler */
export type RobotsRules = {
  allow?: string;
  disallow: Array<string>;
  /** Absolute address of the sitemap */
  sitemap?: string;
};

/**
 * What crawlers are told about the site.
 *
 * A gated site keeps them out altogether; an open one welcomes them, minus
 * what the app serves besides the site, and names its sitemap when its own
 * origin is known.
 *
 * @param disallow - Paths kept out of an open site, such as the cms's `/admin`
 * @param origin - The address the site calls its own
 */
export function robotsRules({
  gated,
  disallow = [],
  origin
}: {
  gated: boolean;
  disallow?: ReadonlyArray<string>;
  origin?: string | null;
}): RobotsRules {
  if (gated) {
    return { disallow: ['/'] };
  }

  return {
    allow: '/',
    disallow: [...disallow],
    ...(origin && { sitemap: new URL('/sitemap.xml', origin).toString() })
  };
}
