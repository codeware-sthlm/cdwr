/**
 * Where to send a visitor once they are through the gate.
 *
 * Only a local path is honoured. `//elsewhere.test` is a protocol-relative
 * url and an absolute one names its own host, so either would turn the gate
 * into an open redirect; a backslash is read as a slash by some clients.
 *
 * Takes whatever the framework hands over: Next gives an array for a repeated
 * query key, and a gate that crashes on `?from=/a&from=/b` is a gate anyone
 * can knock over.
 *
 * @param raw - The path the gate carried along, as it arrived
 * @returns A safe local path, falling back to the site root
 */
export function resolveReturnPath(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\')
  ) {
    return '/';
  }

  return raw;
}
