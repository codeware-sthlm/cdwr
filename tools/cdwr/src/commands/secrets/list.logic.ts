import {
  type InfisicalRunner,
  discoverPaths,
  readKeyLengths,
  runInfisical
} from '@codeware/shared/util/infisical-cli';

import { type FlyToken, tokenExpiryByName } from '../../services/fly';

import {
  CATALOG,
  type CatalogEntry,
  PROJECTS,
  PROJECT_NAMES,
  type ProjectName,
  type SecretEnvironment,
  type SecretKind,
  environmentsOf,
  findEntry
} from './catalog';

export interface Scope {
  project: ProjectName;
  environment: SecretEnvironment;
}

/** One key where it lives; the value is never part of it */
export interface ReadKey {
  path: string;
  key: string;
  /** null when only a personal override came back */
  length: number | null;
}

/** What reading one scope gave: its keys, or why it failed */
export type ScopeRead = Scope & ({ keys: ReadKey[] } | { error: string });

/** A scope that was read */
export type ScopeKeys = Scope & { keys: ReadKey[] };

export const wasRead = (result: ScopeRead): result is ScopeKeys =>
  'keys' in result;

const NOT_IN_CATALOG = 'not in the catalog';

export interface SecretRow {
  project: ProjectName;
  environment: SecretEnvironment;
  path: string;
  key: string;
  /** Derived from the length only */
  value: string;
  kind: SecretKind | typeof NOT_IN_CATALOG;
  /** Whether the catalog has an entry for the key */
  known: boolean;
  purpose: string;
  expiry: string;
  /** The cdwr command, the steps by hand, or `-` */
  rotate: string;
  rotateBy: 'command' | 'manual' | 'none';
}

/** Rows under a `project · environment · path` heading, in row order */
export const groupByFolder = (
  rows: readonly SecretRow[]
): Map<string, SecretRow[]> => {
  const groups = new Map<string, SecretRow[]>();
  for (const row of rows) {
    const heading = `${row.project} · ${row.environment} · ${row.path}`;
    groups.set(heading, [...(groups.get(heading) ?? []), row]);
  }
  return groups;
};

export type FlyTokens = FlyToken[] | { error: string };

/** The project and environment pairs to read; each project holds only its own environments */
export const scope = (
  projectFilter?: ProjectName,
  envFilter?: SecretEnvironment
): Scope[] =>
  PROJECT_NAMES.filter(
    (project) => !projectFilter || project === projectFilter
  ).flatMap((project) =>
    environmentsOf(project)
      .filter((environment) => !envFilter || environment === envFilter)
      .map((environment) => ({ project, environment }))
  );

/** Every key under the project's root with its value length */
export const readProject = (
  project: ProjectName,
  environment: SecretEnvironment,
  run: InfisicalRunner = runInfisical
): ReadKey[] => {
  const { id } = PROJECTS[project];
  return discoverPaths('/', environment, run, id).flatMap((path) =>
    readKeyLengths(path, environment, run, id).map(({ key, length }) => ({
      path,
      key,
      length
    }))
  );
};

const valueText = (length: number | null): string =>
  length === null
    ? 'personal override only'
    : length === 0
      ? 'empty'
      : `set · ${length} ${length === 1 ? 'char' : 'chars'}`;

const expiryText = (
  entry: CatalogEntry,
  tokens: FlyTokens,
  now: Date
): string => {
  if (entry.kind === 'setting') return '-';
  const { expiry } = entry;
  if (expiry.source === 'none') return 'none';
  if (expiry.source === 'unknown') return 'unknown';
  if (!Array.isArray(tokens)) return 'unknown (fly read failed)';
  const found = tokenExpiryByName(tokens, expiry.tokenName, now);
  switch (found.state) {
    case 'found':
      return found.expiresAt.slice(0, 10);
    case 'expired':
      return `expired ${found.expiresAt.slice(0, 10)}`;
    case 'ambiguous':
      return 'unknown (ambiguous)';
    case 'missing':
      return `unknown (no token named "${expiry.tokenName}")`;
  }
};

const rotateOf = (
  entry: CatalogEntry
): Pick<SecretRow, 'rotate' | 'rotateBy'> => {
  if (entry.kind === 'setting') return { rotate: '-', rotateBy: 'none' };
  return 'command' in entry.rotation
    ? {
        rotate: `cdwr ${entry.rotation.command.join(' ')}`,
        rotateBy: 'command'
      }
    : { rotate: entry.rotation.manual, rotateBy: 'manual' };
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Join what was read with the catalog; sorted by project and environment in catalog order, then path, key */
export const buildRows = (
  read: ScopeKeys[],
  tokens: FlyTokens,
  catalog: readonly CatalogEntry[] = CATALOG,
  now: Date = new Date()
): SecretRow[] =>
  read
    .flatMap(({ project, environment, keys }) =>
      keys.map(({ path, key, length }): SecretRow => {
        const entry = findEntry(project, environment, path, key, catalog);
        const base = {
          project,
          environment,
          path,
          key,
          value: valueText(length)
        };
        return entry
          ? {
              ...base,
              kind: entry.kind,
              known: true,
              purpose: entry.purpose,
              expiry: expiryText(entry, tokens, now),
              ...rotateOf(entry)
            }
          : {
              ...base,
              kind: NOT_IN_CATALOG,
              known: false,
              purpose: NOT_IN_CATALOG,
              expiry: 'unknown',
              rotate: '-',
              rotateBy: 'none'
            };
      })
    )
    .sort(
      (a, b) =>
        PROJECT_NAMES.indexOf(a.project) - PROJECT_NAMES.indexOf(b.project) ||
        environmentsOf(a.project).indexOf(a.environment) -
          environmentsOf(b.project).indexOf(b.environment) ||
        compare(a.path, b.path) ||
        compare(a.key, b.key)
    );
