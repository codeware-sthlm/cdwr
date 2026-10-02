import type {
  BuildComponentOptions,
  BuildComponentResult,
  HostModule
} from '@codeware/app-cms/feature/component-builder';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type { ComponentDiagnostic } from '@codeware/shared/util/payload-utils';

import {
  type ToolchainResult,
  resolveToolchain
} from '../collections/custom-components/toolchain';

import { compareComponentProps } from './compare-component-props';

type Builder = {
  buildComponent: (
    options: BuildComponentOptions
  ) => Promise<BuildComponentResult>;
  DEFAULT_HOST_MODULES: Readonly<Record<string, HostModule>>;
};

export type BuildDeps = {
  resolveToolchain: () => ToolchainResult;
  loadBuilder: () => Promise<Builder>;
};

export const defaultDeps: BuildDeps = {
  resolveToolchain: () =>
    resolveToolchain({
      override: getEnv(false)?.COMPONENT_TOOLCHAIN_ROOT,
      cwd: process.cwd()
    }),
  // Imported when a build runs, so esbuild, typescript and the native
  // tailwind engine never enter a graph Next bundles
  loadBuilder: () => import('@codeware/app-cms/feature/component-builder')
};

export const errorDiagnostic = (message: string): ComponentDiagnostic => ({
  message,
  line: 1,
  column: 1,
  severity: 'error'
});

export type ComponentBuildInput = {
  tagName: string;
  source: string;
  /** Compared with the code's props; leave out to skip the comparison */
  propsSchema?: CustomComponent['propsSchema'];
};

/** True when a finding stops the component from being used. */
export const hasErrors = (diagnostics: readonly ComponentDiagnostic[]) =>
  diagnostics.some(({ severity }) => severity === 'error');

/**
 * Resolves the toolchain, loads the builder, builds the source and compares
 * its props with the declared ones.
 *
 * A successful result carries the comparison's findings among its
 * diagnostics; whether they fail the build is the caller's call.
 */
export const runComponentBuild = async (
  { tagName, source, propsSchema }: ComponentBuildInput,
  deps: BuildDeps = defaultDeps
): Promise<BuildComponentResult> => {
  const resolved = deps.resolveToolchain();
  if (!resolved.ok) {
    return {
      ok: false,
      diagnostics: [
        errorDiagnostic(
          `The component build toolchain is not available in this environment. ${resolved.reason}.`
        )
      ]
    };
  }

  const { root, kit, themeCss } = resolved.toolchain;
  const { buildComponent, DEFAULT_HOST_MODULES } = await deps.loadBuilder();
  const result = await buildComponent({
    tagName,
    source,
    themeCss,
    workspaceRoot: root,
    hostModules: { ...DEFAULT_HOST_MODULES, '@site/ui': { typesEntry: kit } }
  });

  if (!result.ok || propsSchema === undefined) {
    return result;
  }

  return {
    ...result,
    diagnostics: [
      ...result.diagnostics,
      ...compareComponentProps(result.props, propsSchema)
    ]
  };
};
