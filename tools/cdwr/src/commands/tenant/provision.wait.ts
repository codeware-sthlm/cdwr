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

/** What identifies the run a dispatch started */
export interface Dispatch {
  /** Runs that existed before it, by id */
  known: ReadonlySet<number>;
  /** Time just before the dispatch */
  at: number;
}

/** Allowed difference between this machine's clock and GitHub's */
export const CLOCK_SKEW_MS = 30_000;

/** The earliest manually started run created at the dispatch, if it has appeared */
export const dispatchedRun = (
  runs: ReadonlyArray<WorkflowRun>,
  { known, at }: Dispatch
): WorkflowRun | undefined =>
  runs
    .filter(
      ({ id, event, createdAt }) =>
        !known.has(id) &&
        event === 'workflow_dispatch' &&
        Date.parse(createdAt) >= at - CLOCK_SKEW_MS
    )
    .sort((a, b) => a.id - b.id)[0];

export interface AwaitLiveOptions {
  /** The dispatch of the cms run; `undefined` when nothing was dispatched */
  dispatch: Dispatch | undefined;
  listRuns: () => Promise<WorkflowRun[]>;
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
  dispatch,
  listRuns,
  healthUrl,
  deployTimeoutMs = DEPLOY_TIMEOUT_MS,
  healthTimeoutMs = HEALTH_TIMEOUT_MS,
  clock = realClock,
  check = checkHealth
}: AwaitLiveOptions): Promise<Liveness> {
  if (dispatch) {
    const deadline = clock.now() + deployTimeoutMs;
    for (;;) {
      const runs = await listRuns().catch(() => []);
      const run = dispatchedRun(runs, dispatch);
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
