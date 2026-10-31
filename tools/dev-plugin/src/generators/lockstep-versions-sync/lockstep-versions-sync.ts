import type { Tree } from '@nx/devkit';
import type { SyncGeneratorResult } from 'nx/src/utils/sync-generators';
import { format, resolveConfig } from 'prettier';

const ROOT_MANIFEST = 'package.json';

/**
 * A dependency family released in lockstep: every member publishes the same
 * version, and mixing them breaks at runtime (COD-490: Storybook addons on
 * 10.6.0 next to `storybook` 10.6.1 failed `storybook:test`).
 *
 * Members are matched by name or scope prefix, so a member added later is
 * covered without editing a list. A package inside a family's scope that
 * versions on its own line must go in `except`, or `nx sync` pins it to a
 * version that doesn't exist. Lookalikes outside the scope don't match:
 * `ts-jest`, `@types/jest`, `@swc/jest`, `@testing-library/jest-dom`,
 * `@chromatic-com/storybook`, `eslint-plugin-playwright`,
 * `prettier-plugin-tailwindcss`, `payload-totp` and `nx-cloud`.
 */
type Family = {
  name: string;
  names: string[];
  scopes: string[];
  prefixes?: string[];
  except?: string[];
};

const FAMILIES: Family[] = [
  { name: 'Nx', names: ['nx', 'create-nx-workspace'], scopes: ['@nx/'] },
  { name: 'Payload', names: ['payload'], scopes: ['@payloadcms/'] },
  { name: 'Storybook', names: ['storybook'], scopes: ['@storybook/'] },
  { name: 'Vitest', names: ['vitest'], scopes: ['@vitest/'] },
  {
    name: 'Tailwind',
    names: ['tailwindcss'],
    scopes: ['@tailwindcss/'],
    except: ['@tailwindcss/typography']
  },
  { name: 'Playwright', names: ['playwright'], scopes: ['@playwright/'] },
  { name: 'Remix', names: ['remix'], scopes: ['@remix-run/'] },
  {
    name: 'Jest',
    names: ['jest', 'babel-jest'],
    scopes: ['@jest/'],
    prefixes: ['jest-environment-']
  }
];

function isMember(family: Family, pkg: string): boolean {
  if (family.except?.includes(pkg)) {
    return false;
  }
  return (
    family.names.includes(pkg) ||
    family.scopes.some((scope) => pkg.startsWith(scope)) ||
    (family.prefixes ?? []).some((prefix) => pkg.startsWith(prefix))
  );
}

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type Parsed = { core: [number, number, number]; pre: string | null };

/** The version a spec names, with a leading `^`, `~` or `=` stripped. */
function parse(spec: string): { version: string; parsed: Parsed } | null {
  const version = spec.replace(/^[\^~=]/, '');
  if (!EXACT.test(version)) {
    return null;
  }
  const [core, ...pre] = version.split('-');
  const [major, minor, patch] = core.split('.').map(Number);
  return {
    version,
    parsed: {
      core: [major, minor, patch],
      pre: pre.length > 0 ? pre.join('-') : null
    }
  };
}

function compare(a: Parsed, b: Parsed): number {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) {
      return a.core[i] - b.core[i];
    }
  }
  // A release outranks its prereleases
  if (a.pre === b.pre) {
    return 0;
  }
  if (a.pre === null) {
    return 1;
  }
  if (b.pre === null) {
    return -1;
  }
  return a.pre.localeCompare(b.pre, 'en', { numeric: true });
}

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

const SECTIONS = ['dependencies', 'devDependencies'] as const;

/**
 * Keep every lockstep family in the root `package.json` on one exact version.
 *
 * Exact pins stop the lockfile from drifting, but not a bump that moves some
 * members and not others (COD-681: three Storybook packages left on 10.6.1).
 * A family is out of sync when its members disagree or one of them is on a
 * range. `nx sync` moves every member to the family's highest version, exact;
 * `pnpm install` then updates the lockfile. Only the root manifest's
 * `dependencies` and `devDependencies` are checked.
 */
export async function syncLockstepVersions(
  tree: Tree
): Promise<SyncGeneratorResult | void> {
  const raw = tree.read(ROOT_MANIFEST, 'utf-8');
  if (!raw) {
    return;
  }
  const manifest = JSON.parse(raw) as Manifest;
  const outOfSync: string[] = [];

  for (const family of FAMILIES) {
    const members = SECTIONS.flatMap((section) =>
      Object.entries(manifest[section] ?? {})
        // A protocol spec (`catalog:`, `workspace:`, `npm:` alias) is resolved
        // elsewhere and left alone
        .filter(([pkg, spec]) => isMember(family, pkg) && !spec.includes(':'))
        .map(([pkg, spec]) => ({ section, pkg, spec }))
    );

    const target = members.reduce<ReturnType<typeof parse>>(
      (best, { spec }) => {
        const candidate = parse(spec);
        return candidate &&
          (!best || compare(candidate.parsed, best.parsed) > 0)
          ? candidate
          : best;
      },
      null
    );
    // Nothing to align to. Throwing would fail every task run, since this is a
    // global sync generator
    if (!target) {
      continue;
    }

    const off = members.filter(({ spec }) => spec !== target.version);
    if (off.length === 0) {
      continue;
    }

    for (const { section, pkg } of off) {
      (manifest[section] as Record<string, string>)[pkg] = target.version;
    }
    outOfSync.push(
      `${family.name} moves to ${target.version}: ${off.map(({ pkg, spec }) => `${pkg} (${spec})`).join(', ')}.`
    );
  }

  if (outOfSync.length === 0) {
    return;
  }

  const prettierConfig = await resolveConfig(ROOT_MANIFEST);
  tree.write(
    ROOT_MANIFEST,
    await format(JSON.stringify(manifest), {
      ...prettierConfig,
      filepath: ROOT_MANIFEST
    })
  );

  return {
    outOfSyncMessage: `Lockstep dependency families in '${ROOT_MANIFEST}' disagree:\n  ${outOfSync.join('\n  ')}\nRun 'nx sync', then 'pnpm install'.`
  };
}

// Global sync generator, registered in `nx.json` (`sync.globalGenerators`), so
// every task run checks it
export default syncLockstepVersions;
