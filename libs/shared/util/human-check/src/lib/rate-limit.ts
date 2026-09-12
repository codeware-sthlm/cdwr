export type RateLimitConfig = {
  /** Submissions allowed inside the window */
  limit?: number;
  windowMs?: number;
  now?: () => number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Keys are addresses, so the table is swept rather than left to grow with
 * every visitor the machine ever saw.
 */
const MAX_KEYS = 10_000;

const hits = new Map<string, Array<number>>();

const sweep = (cutoff: number) => {
  for (const [key, times] of hits) {
    const live = times.filter((time) => time > cutoff);
    if (live.length) {
      hits.set(key, live);
    } else {
      hits.delete(key);
    }
  }
};

/**
 * Count what one caller has sent lately, and say whether to take another.
 *
 * A sliding window held in this process and nowhere else. A deployment runs
 * more than one machine, so the real allowance is this limit times the machine
 * count — which is the honest cost of not running a shared store for a contact
 * form, and enough to turn a flood into a trickle. Anything determined enough
 * to rotate addresses was never going to be stopped here; that is what the
 * token check is for.
 *
 * Restarting a machine forgets its counts. That is a feature of the same
 * trade-off, not an oversight.
 *
 * @param key - Who is asking, usually their address plus what they are posting to
 */
export function rateLimit(
  key: string,
  {
    limit = DEFAULT_LIMIT,
    windowMs = DEFAULT_WINDOW_MS,
    now = Date.now
  }: RateLimitConfig = {}
): RateLimitResult {
  const moment = now();
  const cutoff = moment - windowMs;

  if (hits.size > MAX_KEYS) {
    sweep(cutoff);
  }

  const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);

  if (recent.length >= limit) {
    const oldest = recent[0];
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + windowMs - moment) / 1000)
      )
    };
  }

  recent.push(moment);
  hits.set(key, recent);

  return { ok: true };
}

/** Forget every count. For tests, and for nothing else. */
export function resetRateLimits(): void {
  hits.clear();
}
