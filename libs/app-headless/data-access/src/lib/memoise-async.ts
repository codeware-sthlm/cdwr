/**
 * Wraps a loader so concurrent calls share one run and a result is reused for
 * a short while. A failure is neither shared past its own run nor kept.
 *
 * @param load - The loader, which throws when it fails
 * @param ttlMs - How long a result is reused
 */
export function memoiseAsync<T>(
  load: () => Promise<T>,
  ttlMs: number
): () => Promise<T> {
  let cached: { value: T; expires: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return () => {
    if (cached && Date.now() < cached.expires) {
      return Promise.resolve(cached.value);
    }

    inFlight ??= load()
      .then((value) => {
        cached = { value, expires: Date.now() + ttlMs };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
