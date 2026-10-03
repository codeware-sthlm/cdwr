import type { ComponentBuildInput } from '@codeware/app-cms/feature/component-builder';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  type ComponentBuildResult,
  type ComponentDiagnostic
} from '@codeware/shared/util/payload-utils';

import { type BuildService, buildRemotely } from './remote-component-build';

export type { ComponentBuildInput };

export type BuildDeps = {
  /** Builds in this process, with the toolchain on disk */
  buildLocally: (input: ComponentBuildInput) => Promise<ComponentBuildResult>;
  /** The build service that takes builds over; undefined builds locally */
  service: () => BuildService | undefined;
  fetch: typeof fetch;
};

export const defaultDeps: BuildDeps = {
  // Imported when a build runs, so esbuild, typescript and the native
  // tailwind engine never enter a graph Next bundles
  buildLocally: async (input) => {
    const { runComponentBuild } =
      await import('@codeware/app-cms/feature/component-builder');
    return runComponentBuild(input, {
      root: getEnv(false)?.COMPONENT_TOOLCHAIN_ROOT,
      cwd: process.cwd()
    });
  },
  service: () => {
    const env = getEnv(false);
    return env?.COMPONENT_BUILDER_URL
      ? { url: env.COMPONENT_BUILDER_URL, token: env.COMPONENT_BUILDER_TOKEN }
      : undefined;
  },
  fetch: (input, init) => fetch(input, init)
};

export const errorDiagnostic = (message: string): ComponentDiagnostic => ({
  message,
  line: 1,
  column: 1,
  severity: 'error'
});

/** True when a finding stops the component from being used. */
export const hasErrors = (diagnostics: readonly ComponentDiagnostic[]) =>
  diagnostics.some(({ severity }) => severity === 'error');

/**
 * Builds the source and compares its props with the declared ones.
 *
 * Goes to the build service when one is configured, and builds with the local
 * toolchain otherwise. A successful result carries the comparison's findings
 * among its diagnostics; whether they fail the build is the caller's call.
 */
export const runComponentBuild = async (
  input: ComponentBuildInput,
  deps: BuildDeps = defaultDeps
): Promise<ComponentBuildResult> => {
  const service = deps.service();
  return service
    ? buildRemotely(input, service, deps.fetch)
    : deps.buildLocally(input);
};
