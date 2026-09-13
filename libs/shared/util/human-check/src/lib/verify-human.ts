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
  /**
   * Milliseconds the browser says passed between drawing the form and sending
   * it, measured on its own monotonic clock.
   *
   * A duration rather than a timestamp: the two clocks involved in comparing a
   * browser's `Date.now()` with the server's need not agree, and a visitor
   * whose clock runs a minute fast would be refused every time with nothing to
   * see. A script can lie about a duration exactly as easily, which costs
   * nothing here — Turnstile is what a liar still has to pass.
   */
  elapsedMs?: unknown;
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
   * How quickly a submission may arrive after the form was drawn, where no
   * Turnstile key is configured.
   *
   * Not a measure of typing speed. A person choosing a saved autofill entry
   * can send a short form in about a second; a script sends it in none.
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
};

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Low on purpose: scripts post in milliseconds, so a second stops them just as
// well as three did, and three refused people picking an autofill entry
const DEFAULT_MIN_FILL_MS = 1000;

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
 * The honeypot always, since it costs nothing and catches anything that fills
 * every field it finds. Then one of two, depending on the deployment:
 *
 * - **Turnstile**, where a key is configured. It has already answered whether a
 *   person was there, so nothing else is asked.
 * - **The clock**, where there is none — the time between the form being drawn
 *   and sent. Forgeable, and still enough to stop a script that posts the
 *   moment it parses the page. It stands in for Turnstile rather than adding
 *   to it: on top of a token it catches no script the token did not, and it
 *   refuses the people who send a short form quickly.
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
    fetchImpl = fetch
  } = config;

  if (asText(fields.honeypot)) {
    return { ok: false, reason: 'honeypot' };
  }

  if (!secretKey) {
    // A form that never said how long it took cannot show that filling it took
    // any time, so it is treated the same as one sent instantly
    const elapsedMs = Number(fields.elapsedMs);

    return !Number.isFinite(elapsedMs) || elapsedMs < minFillMs
      ? { ok: false, reason: 'too-fast' }
      : { ok: true };
  }

  const token = asText(fields.token);

  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }

  const body = new URLSearchParams({ secret: secretKey, response: token });

  if (ip) {
    body.set('remoteip', ip);
  }

  let outcome: unknown;

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

    outcome = await response.json();
  } catch {
    return { ok: false, reason: 'verify-unavailable' };
  }

  // A body that is not an object at all — `null` is valid JSON — says nothing
  // about the token, so it is an outage rather than a verdict. Reading through
  // it would throw here, outside the catch above, and turn a verifier having a
  // bad minute into a 500 for the visitor
  if (typeof outcome !== 'object' || outcome === null) {
    return { ok: false, reason: 'verify-unavailable' };
  }

  // A replayed token comes back as `timeout-or-duplicate` rather than as a
  // transport failure, so it belongs with the refusals, not the outages
  return (outcome as TurnstileResponse).success === true
    ? { ok: true }
    : { ok: false, reason: 'token-rejected' };
}
