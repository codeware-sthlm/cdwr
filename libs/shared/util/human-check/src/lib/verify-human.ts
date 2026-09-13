/**
 * Reasons a submission is refused.
 *
 * Named rather than boolean so a route can log which gate closed without
 * telling the visitor, who is only ever told that the submission failed.
 */
export type HumanCheckFailure =
  | 'honeypot'
  | 'too-fast'
  | 'missing-token'
  | 'token-rejected'
  | 'verify-unavailable';

export type HumanCheckResult =
  | { ok: true }
  | { ok: false; reason: HumanCheckFailure };

/** What the browser sends along with a submission. */
export type HumanCheckFields = {
  /** Turnstile's token, when the site renders the widget */
  token?: unknown;
  /** A field no person can see, so anything in it was filled by a script */
  honeypot?: unknown;
  /** Epoch ms when the form was drawn */
  drawnAt?: unknown;
};

export type HumanCheckConfig = {
  /**
   * Turnstile's secret.
   *
   * Absent means the token check does not run — the honeypot and the timing
   * check still do, so a site with no key configured is guarded rather than
   * open.
   */
  secretKey?: string;
  /** The visitor's address, passed to Turnstile when known */
  ip?: string;
  /**
   * How quickly a submission may arrive after the form was drawn.
   *
   * Not a measure of typing speed — a person filling in a name and an email
   * takes several seconds, and a script takes none.
   */
  minFillMs?: number;
  /**
   * How long to wait for Cloudflare before giving up.
   *
   * A hung verifier must not hold the route open: enough held requests is a
   * way to exhaust the workers answering everyone else.
   */
  timeoutMs?: number;
  /** Injected by tests, and by nothing else */
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const DEFAULT_MIN_FILL_MS = 3000;

const DEFAULT_TIMEOUT_MS = 5000;

type TurnstileResponse = {
  success?: boolean;
  'error-codes'?: Array<string>;
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Decide whether a submission came from a person.
 *
 * Three gates, cheapest first, so a script is usually refused before anything
 * leaves the machine:
 *
 * 1. the honeypot, which costs nothing and catches anything that fills every
 *    field it finds;
 * 2. the time between the form being drawn and sent — forgeable, and still
 *    enough to stop a script that posts the moment it parses the page;
 * 3. Turnstile, where a key is configured.
 *
 * The caller decides what a refusal means. Every reason here is a refusal,
 * including `verify-unavailable`: a form that lets everything through while
 * Turnstile is unreachable is a form with no check at all on the day it
 * matters.
 */
export async function verifyHuman(
  fields: HumanCheckFields,
  config: HumanCheckConfig = {}
): Promise<HumanCheckResult> {
  const {
    secretKey,
    ip,
    minFillMs = DEFAULT_MIN_FILL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    now = Date.now
  } = config;

  if (asText(fields.honeypot)) {
    return { ok: false, reason: 'honeypot' };
  }

  // A form that never said when it was drawn cannot show that filling it took
  // any time, so it is treated the same as one sent instantly
  const drawnAt = Number(fields.drawnAt);
  if (!Number.isFinite(drawnAt) || now() - drawnAt < minFillMs) {
    return { ok: false, reason: 'too-fast' };
  }

  if (!secretKey) {
    return { ok: true };
  }

  const token = asText(fields.token);

  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }

  const body = new URLSearchParams({ secret: secretKey, response: token });

  if (ip) {
    body.set('remoteip', ip);
  }

  let outcome: TurnstileResponse;

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      // A verifier that hangs is answered the same way as one that refuses to
      // talk at all, rather than by waiting for the platform's own timeout
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      return { ok: false, reason: 'verify-unavailable' };
    }

    outcome = (await response.json()) as TurnstileResponse;
  } catch {
    return { ok: false, reason: 'verify-unavailable' };
  }

  // A replayed token comes back as `timeout-or-duplicate` rather than as a
  // transport failure, so it belongs with the refusals, not the outages
  return outcome.success === true
    ? { ok: true }
    : { ok: false, reason: 'token-rejected' };
}
