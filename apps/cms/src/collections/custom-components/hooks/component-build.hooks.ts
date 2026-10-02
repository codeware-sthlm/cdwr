import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  PayloadRequest
} from 'payload';

import {
  BUILD_CUSTOM_COMPONENT_TASK,
  COMPONENT_BUILD_CONTEXT,
  COMPONENT_BUILD_QUEUE
} from '../../../jobs/build-custom-component.task';

/** The seed passes this; a seeded component is built by the queue sweep. */
const SEED_CONTEXT = 'seedAction';

const COMMIT_POLL_MS = 50;
const COMMIT_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the build compares the code against; labels and row ids do not count. */
const schemaSignature = (schema: CustomComponent['propsSchema']): string =>
  JSON.stringify(
    (schema ?? []).map(({ name, type, required }) => [
      name,
      type,
      required === true
    ])
  );

/**
 * Marks the component pending when its source, slug or declared props are new
 * or changed.
 *
 * The previous bundle stays in place until the next build replaces it.
 */
export const markBuildPending: CollectionBeforeChangeHook<CustomComponent> = ({
  data,
  originalDoc,
  operation,
  context
}) => {
  if (context[COMPONENT_BUILD_CONTEXT]) {
    return data;
  }

  const changed =
    operation === 'create' ||
    (data.source !== undefined && data.source !== originalDoc?.source) ||
    (data.slug !== undefined && data.slug !== originalDoc?.slug) ||
    (data.propsSchema !== undefined &&
      schemaSignature(data.propsSchema) !==
        schemaSignature(originalDoc?.propsSchema));

  return changed
    ? {
        ...data,
        build: { ...originalDoc?.build, ...data.build, status: 'pending' }
      }
    : data;
};

/** Builds run one after another: each costs a few hundred MB. */
let running: Promise<void> = Promise.resolve();

/**
 * The save's transaction deletes its id from the request when it ends. The
 * job reads the component through another connection, so it waits for that.
 */
const waitForCommit = async (req: PayloadRequest): Promise<void> => {
  const deadline = Date.now() + COMMIT_TIMEOUT_MS;
  while (req.transactionID && Date.now() < deadline) {
    await sleep(COMMIT_POLL_MS);
  }
};

const queueAndRun = async (
  req: PayloadRequest,
  id: number,
  run: boolean
): Promise<void> => {
  const { payload } = req;
  // No `req`: the job is saved on its own connection, so a rolled-back save
  // leaves a job that finds nothing and ends
  const job = await payload.jobs.queue({
    task: BUILD_CUSTOM_COMPONENT_TASK,
    input: { id },
    queue: COMPONENT_BUILD_QUEUE
  });

  if (!run) {
    return;
  }

  const turn = running.then(async () => {
    await waitForCommit(req);
    await payload.jobs.runByID({ id: job.id });
  });
  // The next build starts whether or not this one threw
  running = turn.catch(() => undefined);
  await turn;
};

/**
 * Queues a build for a pending component and starts it in the background.
 *
 * The save does not wait for it. A job a restart orphans is picked up by the
 * queue's scheduled sweep.
 */
export const queueComponentBuild: CollectionAfterChangeHook<
  CustomComponent
> = ({ doc, context, req }) => {
  if (context[COMPONENT_BUILD_CONTEXT] || doc.build.status !== 'pending') {
    return doc;
  }

  queueAndRun(req, doc.id, !context[SEED_CONTEXT]).catch((error: unknown) => {
    req.payload.logger.error(
      { err: error },
      `[customComponents] Could not build ${doc.slug}`
    );
  });

  return doc;
};
