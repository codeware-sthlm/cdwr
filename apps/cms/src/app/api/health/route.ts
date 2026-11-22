import * as Sentry from '@sentry/nextjs';
import { getPayload } from 'payload';

import config from '../../../payload.config';

/** Under Fly's 5 s check timeout, so the check reads a 503, not a timeout */
export const HEALTH_DEADLINE_MS = 4_000;

type Step = 'init' | 'query';

class DeadlineError extends Error {
  override name = 'DeadlineError';

  constructor() {
    super(`No answer within ${HEALTH_DEADLINE_MS} ms`);
  }
}

const headers = {
  'Content-Type': 'text/plain',
  'Cache-Control': 'no-cache, no-store, must-revalidate'
};

/**
 * A miss this soon after the process started is a boot: Fly's checker reaches
 * a machine while Payload is still starting, so it answers 503 but stays out
 * of Sentry. A failure that lasts past it is reported
 */
export const BOOT_QUIET_S = 120;

/**
 * Whether this run of failures is already reported. Fly checks every 20 s, so
 * only the first reported failure of a run goes to Sentry
 */
let failing = false;

/** Lets a spec start from a healthy process */
export const resetHealthState = () => {
  failing = false;
};

/**
 * Health check endpoint for Fly.io health checks.
 *
 * Verifies both process liveness and database connectivity.
 * Returns 200 OK with "Pong!" when healthy, 503 when the database
 * is unreachable — allowing Fly's rolling deploy to stall on a
 * broken machine rather than routing traffic to it.
 *
 * One deadline covers Payload's start and the query, so a hung pool
 * answers 503 instead of hanging the check. The first failure after a
 * success, once the process is past its boot, goes to Sentry with the step,
 * the pool's counts and who asked:
 * the caller's user agent, whether it came through Fly's proxy, and how
 * long the process had run.
 */
export async function GET(request: Request) {
  let step: Step = 'init';
  let pool: { totalCount?: number; idleCount?: number; waitingCount?: number } =
    {};
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), HEALTH_DEADLINE_MS);
  });

  const check = async () => {
    const payload = await getPayload({ config });
    pool = payload.db.pool;
    step = 'query';
    // Its own timeout, so a hung query fails and the pool drops its client:
    // otherwise every check past the deadline would hold one more. Safe
    // here, unlike pool-wide, since this query runs in no transaction. pg
    // reads `query_timeout` per query; its types only know it pool-wide, so
    // the config is a variable, which skips the excess property check
    const query = {
      text: 'SELECT 1',
      query_timeout: HEALTH_DEADLINE_MS
    };
    await payload.db.pool.query(query);
  };

  try {
    await Promise.race([check(), deadline]);
    failing = false;
    return new Response('Pong!', { status: 200, headers });
  } catch (error) {
    if (!failing && process.uptime() >= BOOT_QUIET_S) {
      Sentry.captureException(error, {
        fingerprint: ['cms-health-check-failed'],
        tags: {
          health_step: step,
          health_timeout: error instanceof DeadlineError,
          health_caller:
            request.headers.get('user-agent')?.slice(0, 64) ?? 'none',
          // Fly's proxy stamps every request it forwards; its own checks
          // reach the machine directly
          health_proxied: request.headers.has('fly-request-id')
        },
        extra: {
          poolTotal: pool.totalCount,
          poolIdle: pool.idleCount,
          poolWaiting: pool.waitingCount,
          uptimeSeconds: Math.round(process.uptime())
        }
      });
      failing = true;
    }
    return new Response('DB unavailable', { status: 503, headers });
  } finally {
    clearTimeout(timer);
  }
}
