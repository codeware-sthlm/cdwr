import type {
  CustomComponent,
  PayloadJob
} from '@codeware/shared/util/payload-types';
import type { BasePayload } from 'payload';

import {
  BUILD_CUSTOM_COMPONENT_TASK,
  COMPONENT_BUILD_QUEUE
} from './build-custom-component.task';
import { inBuildTurn } from './build-turn';

/** How long a component may wait for a build before it is looked at */
export const STALE_BUILD_MS = 5 * 60 * 1000;

/** How often the check runs while the server is up */
export const REQUEUE_INTERVAL_MS = 10 * 60 * 1000;

/** Builds drained in one pass; the next pass takes the rest */
const DRAIN_LIMIT = 20;

const LIMIT = 100;

const LOG = '[componentBuilds]';

export type WaitingComponent = Pick<CustomComponent, 'id' | 'updatedAt'> & {
  build: Pick<CustomComponent['build'], 'status'>;
};

export type OpenJob = Pick<
  PayloadJob,
  'taskSlug' | 'completedAt' | 'hasError'
> & {
  input?: PayloadJob['input'];
};

const jobComponentId = (job: OpenJob): number | undefined => {
  const { input } = job;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  return typeof input['id'] === 'number' ? input['id'] : undefined;
};

type Options = {
  now: Date;
  staleMs?: number;
};

/**
 * Ids of components waiting for a build that nothing is going to run: older
 * than the threshold, with no job that can still run for them.
 */
export function staleComponentBuildIds(
  components: readonly WaitingComponent[],
  jobs: readonly OpenJob[],
  { now, staleMs = STALE_BUILD_MS }: Options
): number[] {
  const covered = new Set<number>();
  for (const job of jobs) {
    const id = jobComponentId(job);
    if (
      id !== undefined &&
      job.taskSlug === BUILD_CUSTOM_COMPONENT_TASK &&
      !job.completedAt &&
      !job.hasError
    ) {
      covered.add(id);
    }
  }

  return components
    .filter(
      ({ id, build, updatedAt }) =>
        (build.status === 'pending' || build.status === 'building') &&
        now.getTime() - new Date(updatedAt).getTime() >= staleMs &&
        !covered.has(id)
    )
    .map(({ id }) => id);
}

/**
 * Frees the jobs a gone process left claimed. Payload never runs a job marked
 * `processing` again, so a build a restart cut off would otherwise stay
 * claimed for good and mask its component from the passes.
 *
 * A rolling deploy may free a job the old machine is still building; both
 * then build the same source, and the later write wins with the same hash.
 */
const releaseClaimedJobs = async (payload: BasePayload): Promise<number> => {
  const { docs } = await payload.update({
    collection: 'payload-jobs',
    where: {
      and: [
        { queue: { equals: COMPONENT_BUILD_QUEUE } },
        { processing: { equals: true } },
        { completedAt: { exists: false } }
      ]
    },
    data: { processing: false },
    depth: 0,
    overrideAccess: true
  });
  return docs.length;
};

/** Queues a build for each stale component; returns how many. */
const requeueStale = async (payload: BasePayload): Promise<number> => {
  const [components, jobs] = await Promise.all([
    payload.find({
      collection: 'custom-components',
      where: { 'build.status': { in: ['pending', 'building'] } },
      select: { build: { status: true }, updatedAt: true },
      limit: LIMIT,
      pagination: false,
      depth: 0,
      overrideAccess: true
    }),
    payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { queue: { equals: COMPONENT_BUILD_QUEUE } },
          { taskSlug: { equals: BUILD_CUSTOM_COMPONENT_TASK } },
          { completedAt: { exists: false } }
        ]
      },
      select: {
        taskSlug: true,
        input: true,
        completedAt: true,
        hasError: true
      },
      limit: LIMIT * 10,
      pagination: false,
      depth: 0,
      overrideAccess: true
    })
  ]);

  const ids = staleComponentBuildIds(components.docs, jobs.docs, {
    now: new Date()
  });
  for (const id of ids) {
    await payload.jobs.queue({
      task: BUILD_CUSTOM_COMPONENT_TASK,
      input: { id },
      queue: COMPONENT_BUILD_QUEUE
    });
    payload.logger.info(`${LOG} Queued a build for component ${id}`);
  }
  return ids.length;
};

/**
 * Runs what the queue holds, one build per turn so a save's own build gets
 * in between, until the queue is empty or the pass has done its share.
 */
const drainQueue = async (payload: BasePayload): Promise<void> => {
  for (let ran = 0; ran < DRAIN_LIMIT; ran++) {
    const { noJobsRemaining } = await inBuildTurn(() =>
      payload.jobs.run({ queue: COMPONENT_BUILD_QUEUE, limit: 1 })
    );
    if (noJobsRemaining) {
      return;
    }
  }
};

/**
 * Builds whatever waits for a build and has nobody to run it: a component
 * whose job a restart cut off or that spent its retries, and a seeded
 * component, which is queued but not started. Never throws.
 *
 * At boot the claims of the process that is gone are released first; later
 * passes leave claimed jobs alone, since this process may hold them.
 */
export async function recoverComponentBuilds(
  payload: BasePayload,
  { boot }: { boot: boolean }
): Promise<void> {
  try {
    if (boot) {
      const released = await releaseClaimedJobs(payload);
      if (released > 0) {
        payload.logger.info(
          `${LOG} Released ${released} build(s) a previous process left claimed`
        );
      }
    }
    await requeueStale(payload);
    await drainQueue(payload);
  } catch (error) {
    payload.logger.error({ err: error }, `${LOG} Could not recover builds`);
  }
}
