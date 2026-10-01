import { existsSync } from 'node:fs';
import path from 'node:path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/** Files, relative to the workspace root, a component build reads. */
const REQUIRED_FILES = {
  tsconfig: 'tsconfig.base.json',
  kit: 'libs/shared/ui/cms-renderer/src/lib/blocks/custom-component/kit.ts',
  themeCss: 'libs/shared/theme/src/lib/_core/site-base.css',
  modules: 'node_modules'
} as const;

export type ComponentToolchain = {
  root: string;
  /** Source of the `@site/ui` module, which components are type-checked against */
  kit: string;
  /** Stylesheet carrying the site theme */
  themeCss: string;
};

export type ToolchainResult =
  { ok: true; toolchain: ComponentToolchain } | { ok: false; reason: string };

/** Walks up from `from` to the directory holding the workspace marker. */
const findWorkspaceRoot = (from: string): string | null => {
  let dir = path.resolve(from);
  for (;;) {
    if (
      existsSync(path.join(/* turbopackIgnore: true */ dir, WORKSPACE_MARKER))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
};

/**
 * Finds the workspace a component is built in.
 *
 * An explicit root wins; otherwise the nearest ancestor of `cwd` holding the
 * workspace marker. The production image carries no workspace, which comes out
 * as a reason rather than a throw.
 */
export const resolveToolchain = ({
  override,
  cwd
}: {
  override?: string;
  cwd: string;
}): ToolchainResult => {
  const root = override ? path.resolve(override) : findWorkspaceRoot(cwd);
  if (!root) {
    return { ok: false, reason: 'No workspace root was found' };
  }

  const missing = Object.values(REQUIRED_FILES).filter(
    (file) => !existsSync(path.join(/* turbopackIgnore: true */ root, file))
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${root} lacks ${missing.join(', ')}`
    };
  }

  return {
    ok: true,
    toolchain: {
      root,
      kit: path.join(/* turbopackIgnore: true */ root, REQUIRED_FILES.kit),
      themeCss: path.join(
        /* turbopackIgnore: true */ root,
        REQUIRED_FILES.themeCss
      )
    }
  };
};
