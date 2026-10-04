import { createHash } from 'node:crypto';

import { COMPONENT_HASH_LENGTH } from '@codeware/shared/util/payload-utils';
import ts from 'typescript';

import { bundle } from './bundle';
import { DEFAULT_BUNDLED_PACKAGES, DEFAULT_HOST_MODULES } from './host-modules';
import { scanImports } from './scan-imports';
import { scopeStyles } from './scope-styles';
import { buildStyles } from './styles';
import { validateTagName } from './tag-name';
import { typecheck } from './typecheck';
import type {
  BuildComponentOptions,
  BuildComponentResult,
  ComponentDiagnostic
} from './types';

const fail = (diagnostics: ComponentDiagnostic[]): BuildComponentResult => ({
  ok: false,
  diagnostics
});

/**
 * Turns one TSX source into a self-registering web-component bundle plus a
 * Tailwind stylesheet, or into diagnostics.
 */
export const buildComponent = async (
  options: BuildComponentOptions
): Promise<BuildComponentResult> => {
  const {
    tagName,
    source,
    themeCss,
    workspaceRoot = process.cwd(),
    hostModules = DEFAULT_HOST_MODULES,
    bundledPackages = DEFAULT_BUNDLED_PACKAGES
  } = options;

  const tagError = validateTagName(tagName);
  if (tagError) {
    return fail([{ message: tagError, line: 1, column: 1, severity: 'error' }]);
  }

  const parsed = ts.createSourceFile(
    'component.tsx',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const forbidden = scanImports(parsed, [
    ...Object.keys(hostModules),
    ...bundledPackages
  ]);
  if (forbidden.length > 0) {
    return fail(forbidden);
  }

  const { diagnostics, props } = typecheck(source, workspaceRoot, hostModules);
  if (diagnostics.some((d) => d.severity === 'error')) {
    return fail(diagnostics);
  }

  const [js, styles] = await Promise.all([
    bundle(source, tagName, workspaceRoot, hostModules, bundledPackages),
    buildStyles(source, themeCss, workspaceRoot)
  ]);
  if (!js.ok) {
    return fail(js.diagnostics);
  }
  // The stylesheet lives in the page head beside the site's, so it must only
  // ever reach the element it was built for
  const css = scopeStyles(styles, tagName);

  const hash = createHash('sha256')
    .update(js.js)
    .update('\0')
    .update(css)
    .digest('hex')
    .slice(0, COMPONENT_HASH_LENGTH);
  return { ok: true, js: js.js, css, hash, diagnostics, props };
};
