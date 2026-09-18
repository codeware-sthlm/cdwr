export type RateLimitConfig = {
  /** Submissions allowed inside the window */
  limit?: number;
  windowMs?: number;
  now?: () => number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * What one address may send in the window.
 *
 * Sized against a flood, not against enthusiasm. A script posts hundreds a
 * minute; the honest worst case is many people behind one address at once — an
 * office, a school, a mobile carrier putting a whole city behind a handful of
 * addresses — which is exactly what a tour going on sale looks like. A limit
 * that tells the tenth person to come back in ten minutes is a broken form,
 * and a thousand-a-minute flood is stopped just as dead at sixty as at five.
 */
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/**
 * How many callers are tracked at once.
 *
 * Keys are addresses, and addresses can be rotated, so the table has to be
 * bounded rather than merely tidied — otherwise a flood from many addresses is
 * a way to spend this machine's memory.
 */
const MAX_KEYS = 10_000;

/**
 * Callers, least recently seen first.
 *
 * A `Map` keeps insertion order, and every counted request deletes its key
 * before writing it back — so the table is its own LRU list and the entry to
 * evict is simply the first one. Nothing is scanned or sorted: under the
 * rotating-address flood this exists to absorb, sorting the whole table on
 * every request would trade the memory bound for a processor one.
 */
const hits = new Map<string, Array<number>>();

/**
 * Make room for the caller about to be written.
 *
 * The quietest go first: whoever is flooding is by definition the most
 * recently seen, so they stay counted while a visitor who posted once some
 * minutes ago is forgotten — which costs them nothing but a fresh allowance
 * they were not using.
 */
const evictOldest = () => {
  while (hits.size >= MAX_KEYS) {
    const oldest = hits.keys().next();

    if (oldest.done) {
      return;
    }

    hits.delete(oldest.value);
  }
};

/**
 * Whether this caller is already over the limit, without counting the ask.
 *
 * For a check that costs something to run. The site gate derives a key with
 * scrypt before it can tell a wrong password from a right one, and paying
 * that for a caller who is already refused is exactly the cost an attacker
 * would like to impose. Counting stays with `rateLimit`, so a caller cannot
 * be pushed over the limit by asking this.
 *
 * @param key - Who is asking, usually their address plus what they are posting to
 */
export function isRateLimited(
  key: string,
  {
    limit = DEFAULT_LIMIT,
    windowMs = DEFAULT_WINDOW_MS,
    now = Date.now
  }: RateLimitConfig = {}
): boolean {
  const cutoff = now() - windowMs;
  const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);

  return recent.length >= limit;
}

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

  const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
  const refused = recent.length >= limit;

  if (!refused) {
    recent.push(moment);
  }

  // Out and back in, so this caller becomes the most recently seen and the
  // entry at the front of the table is always the one worth evicting. A
  // refused caller is written back too — forgetting them here would hand them
  // a fresh allowance for being over it
  hits.delete(key);
  evictOldest();
  hits.set(key, recent);

  if (refused) {
    const oldest = recent[0];

    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + windowMs - moment) / 1000)
      )
    };
  }

  return { ok: true };
}

/** Forget every count. For tests, and for nothing else. */
export function resetRateLimits(): void {
  hits.clear();
}
