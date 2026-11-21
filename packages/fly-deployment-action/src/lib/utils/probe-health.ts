/** Long enough for `auto_start_machines` to wake a suspended machine and boot it */
export const HEALTH_PROBE_TIMEOUT_MS = 60_000;

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

/**
 * Request a deployed app's health check once.
 *
 * A deploy can go green without the app answering: no public address, a
 * retried first deploy that skipped the health wait on a suspended machine,
 * or an app that boots but cannot serve. One request catches all three.
 *
 * @param url - The app's public url
 * @param path - The health check path
 * @returns `null` when the app answered 200, otherwise why it did not
 */
export const probeHealth = async (
  url: string,
  path: string
): Promise<string | null> => {
  const target = `${url.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  try {
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS)
    });
    return response.status === 200
      ? null
      : `${target} answered ${response.status}`;
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `no answer within ${HEALTH_PROBE_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : String(error);
    return `${target} could not be reached: ${reason}`;
  }
};
