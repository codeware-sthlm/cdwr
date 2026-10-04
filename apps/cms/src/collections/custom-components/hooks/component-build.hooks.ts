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
import { inBuildTurn } from '../../../jobs/build-turn';
import { schemaSignature } from '../../../jobs/component-schema-signature';

/** The seed passes this; a seeded component is built by the recovery pass. */
const SEED_CONTEXT = 'seedAction';

const COMMIT_POLL_MS = 50;
const COMMIT_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Marks the component pending when its source, slug or declared props are new
 * or changed.
 *
 * The previous bundle stays in place until the next build replaces it, except
 * on a slug change: it defines the old tag, so it is cleared rather than
 * served under the new one.
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

  if (!changed) {
    return data;
  }

  const slugChanged =
    operation === 'update' &&
    data.slug !== undefined &&
    data.slug !== originalDoc?.slug;

  return {
    ...data,
    build: {
      ...originalDoc?.build,
      ...data.build,
      status: 'pending',
      ...(slugChanged && { js: null, css: null, hash: null })
    }
  };
};

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

  await inBuildTurn(async () => {
    await waitForCommit(req);
    await payload.jobs.runByID({ id: job.id });
  });
};

/** The states in which a save should (re)start a build */
const shouldQueue = (status: CustomComponent['build']['status']): boolean =>
  status === 'pending' || status === 'building';

/**
 * Queues a build for a component that waits for one and starts it in the
 * background.
 *
 * The save does not wait for it. A job a restart orphans is picked up by the
 * recovery pass. A component still `building` after a save is one
 * whose job was cut off or gave up, so saving it queues a build as well; the
 * task skips a job that finds the build done.
 */
export const queueComponentBuild: CollectionAfterChangeHook<
  CustomComponent
> = ({ doc, context, req }) => {
  if (context[COMPONENT_BUILD_CONTEXT] || !shouldQueue(doc.build.status)) {
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
