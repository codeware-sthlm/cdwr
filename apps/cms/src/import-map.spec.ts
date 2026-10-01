import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Admin components resolve through the committed import map.
 *
 * Payload only regenerates `importMap.js` in `dev`, so the committed file is
 * what the production build and runtime use. A component added to the config
 * without regenerating it does not raise an error — the admin view simply
 * renders without it.
 *
 * Fix a failure with: `nx payload cms generate:importmap`
 */

const workspaceRoot = resolve(__dirname, '../../..');

/** Roots holding config that can reference an admin component */
const sourceRoots = [
  join(workspaceRoot, 'apps/cms/src'),
  join(workspaceRoot, 'libs/app-cms')
];

const importMapFile = join(
  workspaceRoot,
  'apps/cms/src/app/(payload)/admin/importMap.js'
);

/**
 * A component reference is a bare `'<module>'` or an explicit
 * `'<module>#<export>'`. Payload keys the map by the explicit form, defaulting
 * the export to `default`.
 */
const componentPath = /'(@codeware\/[^'\s]+)'/g;

/** Import specifiers look the same but are not component references */
const isImportLine = (line: string) =>
  /^\s*(import|export)\b/.test(line) ||
  line.includes(" from '") ||
  // A dynamic import of a module, as a job task loads its toolchain
  /\bimport\(/.test(line);

const toImportMapKey = (path: string) =>
  path.includes('#') ? path : `${path}#default`;

/**
 * Components belonging to a field factory nothing registers yet, so Payload
 * has no reason to map them.
 *
 * Asserted to stay absent — the moment one is registered this list fails and
 * the entry comes out along with a regenerated map.
 */
const unregisteredComponents = [
  '@codeware/app-cms/ui/fields/callout/CalloutField.client#default'
];

const sourceFiles = (root: string): Array<string> =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path);
    }

    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });

const referencedComponents = (): Set<string> => {
  const found = new Set<string>();

  for (const root of sourceRoots) {
    for (const file of sourceFiles(root)) {
      const lines = readFileSync(file, 'utf8').split('\n');

      for (const line of lines) {
        if (isImportLine(line)) {
          continue;
        }

        for (const [, path] of line.matchAll(componentPath)) {
          found.add(toImportMapKey(path));
        }
      }
    }
  }

  return found;
};

describe('admin import map', () => {
  const importMap = readFileSync(importMapFile, 'utf8');

  /**
   * Whether the map keys a component, whatever quotes it happens to carry.
   *
   * Payload's generator emits double quotes and Prettier rewrites them to single,
   * so the file alternates between the two: anything that loads the payload
   * config regenerates it, including the Nx plugin that infers this project's
   * targets while the tests run. Matching one style tested how the file was last
   * formatted rather than whether the component is mapped, and failed on all of
   * them at once.
   */
  const isMapped = (path: string): boolean =>
    new RegExp(`['"]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(
      importMap
    );
  const referenced = referencedComponents();

  it('finds the component references', () => {
    expect(referenced.size).toBeGreaterThan(0);
  });

  it('maps every referenced admin component', () => {
    const missing = [...referenced]
      .filter(
        (path) => !isMapped(path) && !unregisteredComponents.includes(path)
      )
      .sort();

    expect(missing).toEqual([]);
  });

  it('keeps the unregistered list honest', () => {
    const registered = unregisteredComponents.filter(isMapped);

    expect(registered).toEqual([]);
  });
});
