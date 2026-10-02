import type {
  ComponentDiagnostic,
  ComponentPropDeclaration
} from '@codeware/shared/util/payload-utils';

import { buildComponent } from './build-component';
import { compareComponentProps } from './compare-component-props';
import { DEFAULT_HOST_MODULES } from './host-modules';
import { type ToolchainResult, resolveToolchain } from './toolchain';
import type { BuildComponentOptions, BuildComponentResult } from './types';

export type ComponentBuildInput = {
  tagName: string;
  source: string;
  /** Compared with the code's props; leave out to skip the comparison */
  propsSchema?: readonly ComponentPropDeclaration[] | null;
};

/** Where the workspace a component is built in is looked for */
export type ToolchainLocation = {
  /** Explicit workspace root; wins over the search from `cwd` */
  root?: string;
  /** Where the search for the workspace starts; defaults to the working directory */
  cwd?: string;
};

export type ComponentBuildDeps = {
  resolveToolchain: (location: ToolchainLocation) => ToolchainResult;
  buildComponent: (
    options: BuildComponentOptions
  ) => Promise<BuildComponentResult>;
};

const defaultDeps: ComponentBuildDeps = {
  resolveToolchain: ({ root, cwd = process.cwd() }) =>
    resolveToolchain({ override: root, cwd }),
  buildComponent
};

export const errorDiagnostic = (message: string): ComponentDiagnostic => ({
  message,
  line: 1,
  column: 1,
  severity: 'error'
});

/**
 * Finds the toolchain, builds the source and compares its props with the
 * declared ones.
 *
 * A successful result carries the comparison's findings among its
 * diagnostics; whether they fail the build is the caller's call. A missing
 * toolchain comes out as a failed result rather than a throw.
 */
export const runComponentBuild = async (
  { tagName, source, propsSchema }: ComponentBuildInput,
  location: ToolchainLocation = {},
  deps: ComponentBuildDeps = defaultDeps
): Promise<BuildComponentResult> => {
  const resolved = deps.resolveToolchain(location);
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
  const result = await deps.buildComponent({
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
