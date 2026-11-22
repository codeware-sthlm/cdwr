/** Long enough for `auto_start_machines` to wake a suspended machine and boot it */
export const HEALTH_PROBE_TIMEOUT_MS = 60_000;

/** Covers a cms cold boot (Payload's init took 15-60+ s on previews) with room to spare */
export const HEALTH_PROBE_BUDGET_MS = 180_000;

/** Wait between two attempts */
export const HEALTH_PROBE_INTERVAL_MS = 5_000;

/** Statuses of a proxy or a machine that is not up yet, worth another attempt */
const TRANSIENT_STATUSES: ReadonlyArray<number> = [502, 503, 504];

/**
 * Read the health check path from an app's Fly config: the path of the
 * first `[[http_service.checks]]`.
 *
 * @param httpService - The `http_service` section of `fly config show`
 * @returns The path, or `undefined` when the app has no http check
 */
export const getHealthCheckPath = (
  httpService: Record<string, unknown> | undefined
): string | undefined => {
  const checks = httpService?.['checks'];
  if (!Array.isArray(checks)) {
    return undefined;
  }
  const path = (checks[0] as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' && path ? path : undefined;
};

export type ProbeHealthOptions = {
  /** Total time to keep trying */
  budgetMs?: number;
  /** Wait between two attempts */
  intervalMs?: number;
  /** Replaceable in tests */
  sleep?: (ms: number) => Promise<void>;
  /** Replaceable in tests */
  now?: () => number;
};

/**
 * Request a deployed app's health check until it answers 200 or the
 * budget runs out.
 *
 * A deploy can go green without the app answering: no public address, a
 * retried first deploy that skipped the health wait on a suspended machine,
 * or an app that boots but cannot serve. `fly deploy` may also return while
 * the new machine is still booting, and a booting machine answers 503 until
 * Payload is up, so 502, 503, 504 and fetch errors are retried while budget
 * remains. Any other status is a real answer and returns at once.
 *
 * @param url - The app's public url
 * @param path - The health check path
 * @param options - Budget, interval and clock, for tests
 * @returns `null` when the app answered 200, otherwise why the last attempt failed
 */
export const probeHealth = async (
  url: string,
  path: string,
  options: ProbeHealthOptions = {}
): Promise<string | null> => {
  const {
    budgetMs = HEALTH_PROBE_BUDGET_MS,
    intervalMs = HEALTH_PROBE_INTERVAL_MS,
    sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now
  } = options;
  const target = `${url.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const start = now();
  let last = '';

  for (;;) {
    const timeoutMs = Math.min(
      HEALTH_PROBE_TIMEOUT_MS,
      Math.max(budgetMs - (now() - start), 1)
    );
    try {
      const response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status === 200) {
        return null;
      }
      last = `${target} answered ${response.status}`;
      if (!TRANSIENT_STATUSES.includes(response.status)) {
        return last;
      }
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `no answer within ${timeoutMs / 1000}s`
          : error instanceof Error
            ? error.message
            : String(error);
      last = `${target} could not be reached: ${reason}`;
    }

    if (now() - start + intervalMs >= budgetMs) {
      return `no 200 within ${budgetMs / 1000}s; last: ${last}`;
    }
    await sleep(intervalMs);
  }
};
