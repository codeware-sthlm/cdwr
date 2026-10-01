import {
  type ProjectGraph,
  type Tree,
  createProjectGraphAsync,
  joinPathFragments
} from '@nx/devkit';
import type { SyncGeneratorResult } from 'nx/src/utils/sync-generators';
import { format, resolveConfig } from 'prettier';

/**
 * Curated denylist of **un-bundleable** npm packages.
 *
 * These cannot be bundled into a consumer's esbuild output — either a native
 * `.node` addon or a package with unresolvable dynamic requires (`nx` /
 * `@nx/devkit` drag native `nx`, `@swc/*`, `@angular-devkit/architect`,
 * `@nx/key`). A `libs/` project that imports one of these must ship a private
 * `package.json` declaring the dep so esbuild externalizes it in every
 * bundling consumer.
 *
 * Un-bundleability is a bundle-time property, not statically visible from the
 * import alone, so it can't be inferred — hence a maintained list. Entries
 * ending in `/` match by scope prefix; all others match by exact package name.
 * A trial esbuild bundle would be more precise but re-introduces the lib build
 * target we deliberately dropped (COD-410) — rejected.
 */
const UN_BUNDLEABLE_DEPS = [
  '@homebridge/node-pty-prebuilt-multiarch',
  'node-pty',
  '@nx/devkit',
  'nx',
  '@swc/',
  'esbuild',
  '@tailwindcss/oxide'
] as const;

const LIBS_ROOT = 'libs/';

/**
 * Executors that inline their dependency graph into an output bundle. A lib
 * only needs its un-bundleable deps externalized if it is actually reached by
 * one of these — a lib consumed only by a `tsx`-run command (e.g. the
 * `release-cli` target) resolves everything from `node_modules` at runtime and
 * never bundles, so it needs no manifest.
 */
const BUNDLING_EXECUTORS = new Set([
  '@nx/esbuild:esbuild',
  '@nx/webpack:webpack',
  '@nx/rollup:rollup',
  '@nx/vite:build'
]);

function isUnBundleable(pkg: string): boolean {
  return UN_BUNDLEABLE_DEPS.some((entry) =>
    entry.endsWith('/') ? pkg.startsWith(entry) : pkg === entry
  );
}

/**
 * Set of project names reachable (as dependencies) from any bundling project —
 * i.e. every project whose source ends up inside someone's bundle. Computed by
 * forward-traversing the dependency graph from each bundling project.
 */
function collectBundledProjects(graph: ProjectGraph): Set<string> {
  const bundled = new Set<string>();
  const stack = Object.values(graph.nodes)
    .filter((node) =>
      Object.values(node.data.targets ?? {}).some(
        (target) => target.executor && BUNDLING_EXECUTORS.has(target.executor)
      )
    )
    .map((node) => node.name);

  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const dep of graph.dependencies[current] ?? []) {
      if (dep.target.startsWith('npm:') || bundled.has(dep.target)) {
        continue;
      }
      bundled.add(dep.target);
      stack.push(dep.target);
    }
  }

  return bundled;
}

/**
 * Shape of the private manifests this generator owns. Everything else in a
 * managed `package.json` is preserved; these are the fields it enforces.
 */
type LibManifest = {
  name: string;
  version: string;
  type: string;
  private: boolean;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};

/**
 * Reconcile the private `package.json` of every internal lib that imports an
 * un-bundleable dependency (see {@link UN_BUNDLEABLE_DEPS}).
 *
 * Internal libs are consumed by bundling their **source** — nothing consumes a
 * lib's `dist`, so they have no build target and `enforceBuildableLibDependency`
 * is disabled (COD-410). The one thing that model can't express is: "this lib
 * imports something esbuild cannot bundle, so it needs a manifest to externalize
 * it." Without it the failure surfaces at the wrong place — a consumer's esbuild
 * bundle dies with `No loader is configured for ".node" files` pointing into
 * `node_modules`, not at the lib that forgot its manifest.
 *
 * A second failure mode: a manifest missing `"type": "module"` makes node treat
 * the lib's files as CommonJS (the repo is ESM), so any `tsx`-run script
 * importing the lib's barrel dies with `does not provide an export named …`
 * (this broke `release-cli` and `pnpm cdwr`).
 *
 * This sync generator guards both: for each managed lib it ensures the manifest
 * exists, declares the un-bundleable deps (pinned to the versions resolved at
 * the workspace root, read from the project graph's external nodes), and always
 * carries `"type": "module"` and `"private": true`. `nx sync --check` fails with
 * an actionable message when out of sync; `nx sync` auto-fixes.
 *
 * Scope note (COD-416): this covers the **lib side** of the invariant. The
 * consumer side — reconciling each bundling consumer's `@nx/dependency-checks`
 * `ignoredDependencies` to list the internal libs it imports — is deferred
 * (Phase 2). It edits flat-config `eslint.config.mjs` files and is left
 * hand-maintained for now; the lib-side guard is where the confusing,
 * mislocalized failures actually originated.
 */
export async function syncExternalizedDeps(
  tree: Tree,
  graph: ProjectGraph
): Promise<SyncGeneratorResult | void> {
  const outOfSync: string[] = [];
  const bundled = collectBundledProjects(graph);

  const libs = Object.values(graph.nodes)
    .filter(
      (node) => node.type === 'lib' && node.data.root.startsWith(LIBS_ROOT)
    )
    .sort((a, b) => a.data.root.localeCompare(b.data.root));

  for (const lib of libs) {
    const needed = (graph.dependencies[lib.name] ?? [])
      .filter((dep) => dep.target.startsWith('npm:'))
      .map((dep) => dep.target.slice('npm:'.length))
      .filter(isUnBundleable)
      .sort();

    // A manifest is only needed when the lib both imports an un-bundleable dep
    // AND is actually reached by a bundling consumer. A lib with no un-bundleable
    // import, or one consumed only via `tsx` (no bundling dependent, e.g.
    // `release`), is left untouched — this generator never creates or deletes a
    // manifest it has no reason to own.
    if (needed.length === 0 || !bundled.has(lib.name)) {
      continue;
    }

    const manifestPath = joinPathFragments(lib.data.root, 'package.json');
    const raw = tree.read(manifestPath, 'utf-8');
    const existing = (raw ? JSON.parse(raw) : {}) as Partial<LibManifest>;

    // Pin each un-bundleable dep to the version resolved at the workspace root
    // (Nx's parse of the committed root lockfile — no installed node_modules
    // needed), preserving any other deps the manifest already declares for
    // `@nx/dependency-checks` completeness.
    const dependencies: Record<string, string> = { ...existing.dependencies };
    for (const dep of needed) {
      const resolved = graph.externalNodes?.[`npm:${dep}`]?.data.version;
      if (!resolved) {
        throw new Error(
          `externalize-deps-sync: '${dep}' is imported by '${lib.name}' but not resolved at the workspace root — add it to the root 'package.json' first.`
        );
      }
      dependencies[dep] = resolved;
    }

    const sortedDependencies = Object.fromEntries(
      Object.keys(dependencies)
        .sort()
        .map((key) => [key, dependencies[key]])
    );

    // Canonical shape: enforced fields first (with `type` and `private` forced),
    // any pre-existing extra fields preserved, `dependencies` last.
    const managedKeys = new Set([
      'name',
      'version',
      'type',
      'private',
      'dependencies'
    ]);
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!managedKeys.has(key)) {
        rest[key] = value;
      }
    }
    const manifest: LibManifest = {
      name: existing.name ?? `@codeware/${lib.name}`,
      version: existing.version ?? '0.0.1',
      type: 'module',
      private: true,
      ...rest,
      dependencies: sortedDependencies
    };

    const prettierConfig = await resolveConfig(manifestPath);
    const content = await format(JSON.stringify(manifest), {
      ...prettierConfig,
      filepath: manifestPath
    });

    if (content !== raw) {
      tree.write(manifestPath, content);
      outOfSync.push(
        raw
          ? `'${manifestPath}' updated (un-bundleable deps [${needed.join(', ')}] pinned, 'type: module' + 'private: true' enforced).`
          : `'${manifestPath}' created — '${lib.name}' imports un-bundleable deps [${needed.join(', ')}] and needs a private manifest to externalize them.`
      );
    }
  }

  if (outOfSync.length === 0) {
    return;
  }

  return {
    outOfSyncMessage: `Internal-lib externalization manifests are out of sync:\n  ${outOfSync.join('\n  ')}`
  };
}

/**
 * Global sync generator entry point. Registered in `nx.json`
 * (`sync.globalGenerators`) and enforced in CI via `nx sync --check`.
 */
export async function externalizeDepsSyncGenerator(
  tree: Tree
): Promise<SyncGeneratorResult | void> {
  const graph = await createProjectGraphAsync({ exitOnError: false });
  return syncExternalizedDeps(tree, graph);
}

export default externalizeDepsSyncGenerator;
