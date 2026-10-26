/**
 * Query strings are plain text here: the router's default parser reads values
 * as JSON, which turns `?block=1e2` into `100` before anything can look.
 * A repeated key keeps its first value, as `URLSearchParams.get` does.
 */
export function parseSearch(searchStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(searchStr)) {
    if (!(key in result)) {
      result[key] = value;
    }
  }
  return result;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Read one query string parameter as written in the URL */
export function readSearchParam(
  searchStr: string,
  name: string
): string | null {
  return new URLSearchParams(searchStr).get(name);
}
