import type { ImportRequest } from './insert-import';

/** What the host offers to import; the kit's names load on demand */
export type ImportCatalog = {
  /** Hooks of `react` worth a shortcut */
  reactHooks: readonly string[];
  /** Packages the build bundles, imported as `import {} from 'pkg'` */
  packages: readonly string[];
  /** Names the site kit (`@site/ui`) exports */
  loadKitNames: () => Promise<string[]>;
};

export type ImportGroupId = 'react' | '@site/ui' | 'packages';

export type ImportGroup = {
  id: ImportGroupId;
  title: string;
  entries: ImportRequest[];
};

export const GROUP_TITLES = {
  react: 'React',
  '@site/ui': '@site/ui',
  packages: 'Packages'
} as const satisfies Record<ImportGroupId, string>;

/** The kit's names as they load: not asked for, in flight, failed or here */
export type KitState =
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'ready'; names: readonly string[] };

/** Everything a component may import, grouped for the picker. */
export const importGroups = (
  catalog: Pick<ImportCatalog, 'reactHooks' | 'packages'>,
  kit: KitState
): ImportGroup[] => [
  {
    id: 'react',
    title: GROUP_TITLES.react,
    entries: catalog.reactHooks.map((name) => ({ module: 'react', name }))
  },
  {
    id: '@site/ui',
    title: GROUP_TITLES['@site/ui'],
    entries:
      kit.status === 'ready'
        ? kit.names.map((name) => ({ module: '@site/ui', name }))
        : []
  },
  {
    id: 'packages',
    title: GROUP_TITLES.packages,
    entries: catalog.packages.map((module) => ({ module, name: null }))
  }
];

/** The text on a picker row */
export const importLabel = ({ module, name }: ImportRequest): string =>
  name ?? module;

/** What the row says it inserts, shown beside the label */
export const importHint = ({ module, name }: ImportRequest): string =>
  name === null ? `import {} from '${module}'` : `from '${module}'`;

/** 0 for a prefix match, 1 for a substring, null for none; case-insensitive */
const rank = (label: string, needle: string): 0 | 1 | null => {
  const at = label.toLowerCase().indexOf(needle);
  return at === -1 ? null : at === 0 ? 0 : 1;
};

/**
 * The groups with only the entries that match `query`, best matches first.
 * An empty query keeps every entry in catalog order. Empty groups stay, so
 * the `@site/ui` group can still say it is loading.
 */
export const filterGroups = (
  groups: readonly ImportGroup[],
  query: string
): ImportGroup[] => {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...groups];
  }
  return groups.map((group) => ({
    ...group,
    entries: group.entries
      .flatMap((entry) => {
        const found = rank(importLabel(entry), needle);
        return found === null ? [] : [{ entry, found }];
      })
      .sort((a, b) => a.found - b.found)
      .map(({ entry }) => entry)
  }));
};
