/** Paths a full page load must serve: the cms answers them, this app does not */
const documentPrefixes = ['/admin', '/api'];

/**
 * Whether the router can take a destination without a page load: a path of
 * this app, not an external url and not something the cms serves.
 */
export function isClientPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }

  const pathname = path.split(/[?#]/, 1)[0];
  return !documentPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
