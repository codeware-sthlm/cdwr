import type { WorkflowRun } from '../../services/github';
import { sleep } from '../../services/shell';

/** How long the deployment run may take before the workspace is left pending */
export const DEPLOY_TIMEOUT_MS = 30 * 60_000;

/** How long the site may take to answer once the run succeeded */
export const HEALTH_TIMEOUT_MS = 10 * 60_000;

export const POLL_MS = 10_000;

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = { now: () => Date.now(), sleep };

/** Whether the health endpoint answers 200 */
export const checkHealth = async (url: string): Promise<boolean> =>
  fetch(url, { signal: AbortSignal.timeout(10_000) })
    .then((response) => response.status === 200)
    .catch(() => false);

export type Liveness = { live: true } | { live: false; reason: string };

export interface AwaitLiveOptions {
  /** The cms run the dispatch started; `undefined` when nothing was dispatched */
  runId: number | undefined;
  getRun: (id: number) => Promise<WorkflowRun>;
  healthUrl: string;
  deployTimeoutMs?: number;
  healthTimeoutMs?: number;
  clock?: Clock;
  check?: (url: string) => Promise<boolean>;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * Waits until the dispatched deployment run has succeeded and the site
 * answers its health check. Never throws: any other end is a reason.
 */
export async function awaitLive({
  runId,
  getRun,
  healthUrl,
  deployTimeoutMs = DEPLOY_TIMEOUT_MS,
  healthTimeoutMs = HEALTH_TIMEOUT_MS,
  clock = realClock,
  check = checkHealth
}: AwaitLiveOptions): Promise<Liveness> {
  if (runId !== undefined) {
    const deadline = clock.now() + deployTimeoutMs;
    for (;;) {
      const run = await getRun(runId).catch(() => undefined);
      if (run?.status === 'completed') {
        if (run.conclusion === 'success') break;
        return {
          live: false,
          reason: `the deployment run ended as ${run.conclusion || 'unknown'} (${run.url})`
        };
      }
      if (clock.now() >= deadline) {
        return {
          live: false,
          reason: `the deployment run did not finish within ${minutes(deployTimeoutMs)} minutes`
        };
      }
      await clock.sleep(POLL_MS);
    }
  }

  const deadline = clock.now() + healthTimeoutMs;
  for (;;) {
    if (await check(healthUrl)) return { live: true };
    if (clock.now() >= deadline) {
      return {
        live: false,
        reason: `${healthUrl} did not answer 200 within ${minutes(healthTimeoutMs)} minutes`
      };
    }
    await clock.sleep(POLL_MS);
  }
}
