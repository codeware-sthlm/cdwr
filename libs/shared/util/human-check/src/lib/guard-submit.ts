import { clientIp } from './client-ip';
import { type RateLimitConfig, rateLimit } from './rate-limit';
import { type HumanCheckFields, verifyHuman } from './verify-human';

export type GuardResult =
  | { ok: true }
  | {
      ok: false;
      /** What to answer with */
      status: 400 | 429;
      /** Safe to show a visitor — it names no gate and no rule */
      message: string;
      /** Present only on a 429 */
      retryAfterSeconds?: number;
    };

export type GuardOptions = {
  headers: Headers;
  /**
   * What is being posted to, as one word.
   *
   * Keeps one endpoint's allowance separate from another's, and names the
   * refusal in the log.
   */
  scope: string;
  /** What the browser sent to show a person filled the form in */
  fields: HumanCheckFields;
  /** Turnstile's secret, when the deployment has one */
  secretKey?: string;
  rateLimit?: RateLimitConfig;
};

/**
 * Everything a public submit endpoint does before it trusts a request.
 *
 * Counted first, then checked: a flood costs a map lookup rather than a round
 * trip to Cloudflare and a write. Both hosts call this, so the four endpoints
 * cannot drift apart in what they demand — only in how they phrase an answer,
 * which is the one thing their frameworks disagree about.
 *
 * Returns a decision rather than a response for that reason. The reason a
 * submission was refused is logged and never returned: telling a script which
 * gate closed is telling it how to pass next time.
 */
export async function guardSubmit({
  fields,
  headers,
  rateLimit: rateLimitConfig,
  scope,
  secretKey
}: GuardOptions): Promise<GuardResult> {
  const ip = clientIp(headers);
  const allowance = rateLimit(`${scope}:${ip ?? 'unknown'}`, rateLimitConfig);

  if (!allowance.ok) {
    return {
      ok: false,
      status: 429,
      message: 'Too many submissions',
      retryAfterSeconds: allowance.retryAfterSeconds
    };
  }

  const check = await verifyHuman(fields, { secretKey, ip });

  if (!check.ok) {
    console.warn(`[${scope}] submission refused: ${check.reason}`);

    return {
      ok: false,
      status: 400,
      message: 'Could not accept this submission'
    };
  }

  return { ok: true };
}

/** The headers to answer a refusal with, if any. */
export function guardHeaders(result: GuardResult): Record<string, string> {
  return result.ok || !result.retryAfterSeconds
    ? {}
    : { 'Retry-After': String(result.retryAfterSeconds) };
}
