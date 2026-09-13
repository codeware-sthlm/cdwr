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
 * How many callers are tracked at once.
 *
 * Keys are addresses, and addresses can be rotated, so the table has to be
 * bounded rather than merely tidied — otherwise a flood from many addresses is
 * a way to spend this machine's memory.
 */
const MAX_KEYS = 10_000;

const hits = new Map<string, Array<number>>();

/** Drop what has fallen out of the window, then the least recently seen. */
const prune = (cutoff: number) => {
  for (const [key, times] of hits) {
    const live = times.filter((time) => time > cutoff);
    if (live.length) {
      hits.set(key, live);
    } else {
      hits.delete(key);
    }
  }

  if (hits.size <= MAX_KEYS) {
    return;
  }

  // Still full, so every caller is inside the window and something has to go.
  // The quietest are dropped first: whoever is flooding is by definition the
  // most recently seen, so they stay counted while a visitor who posted once
  // some minutes ago is forgotten — which costs them nothing but a fresh
  // allowance they were not using
  const byAge = [...hits.entries()].sort(
    ([, a], [, b]) => (a.at(-1) ?? 0) - (b.at(-1) ?? 0)
  );

  for (const [key] of byAge.slice(0, hits.size - MAX_KEYS)) {
    hits.delete(key);
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

  if (hits.size >= MAX_KEYS) {
    prune(cutoff);
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
