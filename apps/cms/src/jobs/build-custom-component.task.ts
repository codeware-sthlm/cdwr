import type { BuildComponentResult } from '@codeware/app-cms/feature/component-builder';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import { componentTagName } from '@codeware/shared/util/payload-utils';
import type { BasePayload, TaskConfig } from 'payload';

import {
  type BuildDeps,
  defaultDeps,
  errorDiagnostic,
  hasErrors,
  runComponentBuild
} from './run-component-build';

export type { BuildDeps };

export const BUILD_CUSTOM_COMPONENT_TASK = 'build-custom-component';

/** Own queue, so builds never wait behind the nightly sweeps. */
export const COMPONENT_BUILD_QUEUE = 'component-builds';

/** Set on writes the build makes, so they do not queue another build. */
export const COMPONENT_BUILD_CONTEXT = 'componentBuild';

type Build = NonNullable<CustomComponent['build']>;

export type BuildOutcome = 'ready' | 'failed' | 'skipped';

const findComponent = (payload: BasePayload, id: number) =>
  payload.findByID({
    collection: 'custom-components',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true
  });

/** Writes into `build`, keeping what it already holds for the rest. */
const writeBuild = (
  payload: BasePayload,
  component: CustomComponent,
  build: Partial<Build>
) =>
  payload.update({
    collection: 'custom-components',
    id: component.id,
    data: { build: { ...component.build, ...build } },
    context: { [COMPONENT_BUILD_CONTEXT]: true },
    depth: 0,
    overrideAccess: true
  });

/**
 * Builds one custom component and records the outcome on it.
 *
 * A failed build leaves the previous bundle in place, so a page keeps
 * rendering the last version that compiled. When the source changed while the
 * build ran, nothing is written: that save queued a build of its own.
 */
export async function buildCustomComponent(
  payload: BasePayload,
  id: number,
  deps: BuildDeps = defaultDeps
): Promise<BuildOutcome> {
  const component = await findComponent(payload, id);

  // Built already (or deleted): a second queued job has nothing to do. A
  // component stuck in `building` is a build a restart cut off, so it re-runs
  if (
    !component ||
    (component.build.status !== 'pending' &&
      component.build.status !== 'building')
  ) {
    return 'skipped';
  }

  await writeBuild(payload, component, { status: 'building' });

  let result: BuildComponentResult;
  try {
    result = await runComponentBuild(
      {
        tagName: componentTagName(component.slug),
        source: component.source,
        propsSchema: component.propsSchema ?? []
      },
      deps
    );
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[buildCustomComponent] Unexpected failure building ${component.slug}`
    );
    result = {
      ok: false,
      diagnostics: [
        errorDiagnostic(
          `The build failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`
        )
      ]
    };
  }

  const latest = await findComponent(payload, id);
  if (
    !latest ||
    latest.source !== component.source ||
    latest.slug !== component.slug
  ) {
    return 'skipped';
  }

  if (result.ok) {
    const { diagnostics } = result;

    // The code compiles, but the form would hand it the wrong type
    if (hasErrors(diagnostics)) {
      await writeBuild(payload, latest, { status: 'failed', diagnostics });
      return 'failed';
    }

    await writeBuild(payload, latest, {
      status: 'ready',
      js: result.js,
      css: result.css,
      hash: result.hash,
      diagnostics,
      builtAt: new Date().toISOString()
    });
    return 'ready';
  }

  await writeBuild(payload, latest, {
    status: 'failed',
    diagnostics: result.diagnostics
  });
  return 'failed';
}

/**
 * Compiles a custom component's source into its bundle.
 *
 * Queued by the component's own save and run one at a time, since a build
 * holds a few hundred MB.
 */
export const buildCustomComponentTask: TaskConfig<{
  input: { id: number };
  output: { outcome: BuildOutcome };
}> = {
  slug: BUILD_CUSTOM_COMPONENT_TASK,
  label: 'Build a custom component',
  inputSchema: [{ name: 'id', type: 'number', required: true }],
  retries: 0,
  handler: async ({ input, req }) => ({
    output: { outcome: await buildCustomComponent(req.payload, input.id) }
  })
};
