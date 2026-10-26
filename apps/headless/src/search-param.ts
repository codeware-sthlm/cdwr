/**
 * Read one query string parameter as written in the URL.
 *
 * Takes the raw string: the router's parsed `search` turns `?block=1e2` into
 * the number 100.
 */
export function readSearchParam(
  searchStr: string,
  name: string
): string | null {
  return new URLSearchParams(searchStr).get(name);
}
