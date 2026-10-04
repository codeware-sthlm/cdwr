/**
 * Decide whether a navigation link points at the current location.
 *
 * Matches Remix `NavLink`'s default: a link is active on an exact match or
 * when it's a parent of the current path, so `/posts` stays highlighted on
 * `/posts/some-slug`. The root link is exact-only — every path is below it.
 *
 * @returns `true` when the link should render as active.
 */
export function isActivePath(pathname: string, href: string) {
  const path = normalize(pathname);
  const target = normalize(href);

  if (path === target) {
    return true;
  }

  // A `/` boundary keeps `/posts` from matching `/postsy`
  return target !== '/' && path.startsWith(`${target}/`);
}

/** The link is the current location itself, not a parent of it. */
export function isExactPath(pathname: string, href: string) {
  return normalize(pathname) === normalize(href);
}

function normalize(value: string) {
  return value.endsWith('/') && value !== '/' ? value.slice(0, -1) : value;
}
