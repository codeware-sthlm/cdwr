/** Where the gate asks for the password */
export const SITE_GATE_PATH = '/site-gate';

/** Where its form posts */
export const SITE_GATE_SUBMIT_PATH = '/api/site-gate';

/**
 * Paths the gate never answers for.
 *
 * The admin has its own login, the api authenticates with a tenant key, and
 * the gate needs its own two routes to be reachable. Next's own matcher
 * already keeps `_next/static`, `_next/image` and the favicon out.
 */
const OPEN_PATHS = ['/admin', '/api', SITE_GATE_PATH];

/** A file extension marks a public asset, such as the gate page's own image */
const ASSET = /\.[a-z0-9]+$/i;

/**
 * Whether the gate stands in front of this path.
 *
 * @param pathname - Path of the incoming request
 */
export function isGatedPath(pathname: string): boolean {
  if (ASSET.test(pathname)) {
    return false;
  }

  return !OPEN_PATHS.some(
    (open) => pathname === open || pathname.startsWith(`${open}/`)
  );
}
