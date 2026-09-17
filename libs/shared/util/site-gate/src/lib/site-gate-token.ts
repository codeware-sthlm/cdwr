import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Cookie the signed token is kept in.
 *
 * Owner-prefixed kebab-case, matching `cdwr-theme` and `cdwr-color-scheme`.
 */
export const SITE_GATE_COOKIE = 'cdwr-site-gate';

/** Seven days — long enough that a customer reviewing their site rarely retypes it */
export const SITE_GATE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Key derivation, deliberately slow, for comparing a typed password */
const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * Sign the payload with the password as the HMAC key.
 *
 * Never hash the password itself: that is what CodeQL's
 * `js/insufficient-password-hash` flags, and rightly so.
 */
const sign = (password: string, payload: string): Buffer =>
  createHmac('sha256', password).update(payload).digest();

/**
 * Mint the cookie value for a visitor who typed the right password.
 *
 * `<expiry>.<signature>` — the expiry is readable, and signing it is what
 * stops a visitor from extending their own stay. The password never reaches
 * the browser, and rotating it invalidates every token already handed out.
 *
 * @param password - The site gate password for this tenant and environment
 * @param options - `now` and `maxAgeSeconds` for tests and shorter sessions
 */
export function createSiteGateToken(
  password: string,
  options: { maxAgeSeconds?: number; now?: number } = {}
): string {
  const { maxAgeSeconds = SITE_GATE_MAX_AGE_SECONDS, now = Date.now() } =
    options;
  const expiresAt = Math.floor(now / 1000) + maxAgeSeconds;
  const payload = String(expiresAt);

  return `${payload}.${sign(password, payload).toString('base64url')}`;
}

/**
 * Whether a cookie was signed with this password and has not expired.
 *
 * Answers false for everything else — no token, a tampered one, one signed
 * with a password since rotated — so a caller cannot tell the cases apart.
 *
 * @param token - Cookie value as it arrived
 * @param password - The site gate password for this tenant and environment
 * @param options - `now` for tests
 */
export function verifySiteGateToken(
  token: string | null | undefined,
  password: string,
  options: { now?: number } = {}
): boolean {
  if (!token || !password) {
    return false;
  }

  const separator = token.lastIndexOf('.');
  if (separator < 1) {
    return false;
  }

  const payload = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = sign(password, payload);

  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) {
    return false;
  }

  const expiresAt = Number(payload);
  return (
    Number.isSafeInteger(expiresAt) &&
    expiresAt * 1000 > (options.now ?? Date.now())
  );
}

/**
 * Whether the password a visitor typed is the configured one.
 *
 * Both sides are derived with scrypt under a salt made for this call. That
 * gives two equal-length buffers whatever was typed, so `timingSafeEqual` can
 * do its job and the real password's length stays out of the timing — and the
 * derivation costs enough that each guess is slow, which is the only defence a
 * password form has beyond the attempt limit.
 *
 * An HMAC would equalise the lengths just as well and cost nothing, which is
 * exactly why CodeQL's `js/insufficient-password-hash` refuses it.
 *
 * @param submitted - What the visitor typed
 * @param password - The site gate password for this tenant and environment
 */
export async function matchesSiteGatePassword(
  submitted: string | null | undefined,
  password: string
): Promise<boolean> {
  if (!submitted || !password) {
    return false;
  }

  const salt = randomBytes(16);
  const [typed, configured] = await Promise.all([
    derive(submitted, salt, 32),
    derive(password, salt, 32)
  ]);

  return timingSafeEqual(typed, configured);
}
