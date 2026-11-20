import { SENTRY_TUNNEL_ROUTE } from './sentry-tunnel';

/**
 * Prefixes whose paths may hold a dot: media files under the api, the
 * admin's assets, Next's own files (`/__nextjs_font` among the dev server's),
 * the statistics script, the Sentry tunnel and the well-known files.
 */
const OPEN_PREFIXES = [
  '/api',
  '/admin',
  '/_next',
  '/__nextjs_font',
  '/stats',
  SENTRY_TUNNEL_ROUTE,
  '/.well-known'
];

/**
 * Dotted site paths that a route or a file in `public/` serves.
 *
 * A spec reads the route folders and `public/` from disk, so a new one that
 * is missing here fails it rather than turning into a 404.
 */
export const SITE_FILES = [
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/og-image.png',
  '/site-icon.png',
  '/site-icon.svg',
  '/site-apple-icon.png',
  '/cdwr-cloud.png'
];

/** The admin's block images in `public/blocks` */
const BLOCK_IMAGE = /^\/blocks\/[\w.-]+\.svg$/;

/** A dot, also when percent-encoded */
const DOT = /\.|%2e/i;

/**
 * Whether no site route can answer this path, so it can be refused before
 * anything renders.
 *
 * Page, post and tour slugs keep only word characters, dashes and slashes
 * (`format-slug.ts`), so a dot never matches one. Without this, a scanner's
 * `/.env` or `/wp-config.php` reaches the site's catch-all, which queries
 * Postgres before it finds nothing.
 *
 * @param pathname - Path of the incoming request
 */
export function isUnroutableSitePath(pathname: string): boolean {
  if (!DOT.test(pathname)) {
    return false;
  }

  if (
    OPEN_PREFIXES.some(
      (open) => pathname === open || pathname.startsWith(`${open}/`)
    )
  ) {
    return false;
  }

  return !SITE_FILES.includes(pathname) && !BLOCK_IMAGE.test(pathname);
}
