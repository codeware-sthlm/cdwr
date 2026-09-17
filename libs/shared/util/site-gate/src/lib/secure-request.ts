/**
 * Whether the visitor reached us over https.
 *
 * Read from `x-forwarded-proto` first: behind Fly's TLS terminator the server
 * itself speaks plain http, so a socket-derived scheme says `http` for every
 * visitor and would leave the gate cookie without `Secure`.
 *
 * @param headers - Headers of the incoming request
 * @param url - Its url, used when nothing was forwarded (local development)
 */
export function isSecureRequest(headers: Headers, url: string): boolean {
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  if (forwarded) {
    return forwarded === 'https';
  }

  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
