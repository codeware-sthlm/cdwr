import { createHash } from 'node:crypto';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/** Long enough for the range API on a slow day, short enough to type through */
const TIMEOUT_MS = 2000;

/**
 * Whether a password appears in a known breach, from the Pwned Passwords
 * range API.
 *
 * Only the first five hex characters of the SHA-1 leave the server (the
 * k-anonymity model), and the response is padded so its size says nothing
 * either. Fails open: a timeout, a network error or an unexpected answer
 * counts as not breached, so the check can never lock anyone out of setting a
 * password.
 *
 * @param password - The password as typed
 * @param fetcher - Replaced in tests
 */
export async function isBreachedPassword(
  password: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetcher(`${RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
      return false;
    }

    const body = await response.text();

    // Each line is `SUFFIX:COUNT`; padding entries carry a count of 0
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
