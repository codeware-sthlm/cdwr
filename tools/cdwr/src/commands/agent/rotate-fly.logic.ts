import { createHash } from 'node:crypto';

import type { FlyToken } from '../../services/fly';
import { CATALOG, type CatalogEntry } from '../secrets/catalog';

/** The Fly tokens the agent host holds and the scope each is created with */
export const FLY_ROTATIONS = {
  FLY_API_TOKEN: { scope: 'readonly' },
  DESK_FLY_TOKEN: { scope: 'org' }
} as const satisfies Record<string, { scope: 'readonly' | 'org' }>;

export type FlyKey = keyof typeof FLY_ROTATIONS;

export interface FlyNames {
  name: string;
  legacyName?: string;
}

export const VAULT_FILE = '/run/agent/vault.env';

/** The agent-host catalog entry of the key; throws when it is missing */
export function catalogEntryOf(key: FlyKey): CatalogEntry {
  const entry = CATALOG.find(
    (e) =>
      e.project === 'agent-host' && e.path === '/agent-queue' && e.key === key
  );
  if (!entry) throw new Error(`No agent-host catalog entry for ${key}`);
  return entry;
}

/** The token name, and the one it replaces, from the entry's expiry source */
export function namesOf(key: FlyKey): FlyNames {
  const entry = catalogEntryOf(key);
  if (entry.kind === 'setting' || entry.expiry.source !== 'fly') {
    throw new Error(`${key} has no Fly token name in the catalog`);
  }
  const { tokenName, legacyName } = entry.expiry;
  return { name: tokenName, ...(legacyName ? { legacyName } : {}) };
}

/** The flyctl arguments that create the key's token, valid one year */
export function createArgs(key: FlyKey, org = 'codeware'): string[] {
  return [
    'tokens',
    'create',
    FLY_ROTATIONS[key].scope,
    '-o',
    org,
    '-n',
    namesOf(key).name,
    '-x',
    '8760h'
  ];
}

export type NewToken =
  | { kind: 'one'; id: string }
  | { kind: 'none' }
  | { kind: 'many'; ids: string[] };

/** The live tokens with this name that were not there before */
export function newTokenId(
  before: FlyToken[],
  after: FlyToken[],
  name: string
): NewToken {
  const known = new Set(before.map((token) => token.id));
  const ids = after
    .filter(
      (token) => token.name === name && !token.revokedAt && !known.has(token.id)
    )
    .map((token) => token.id);
  const [id] = ids;
  if (id === undefined) return { kind: 'none' };
  return ids.length === 1 ? { kind: 'one', id } : { kind: 'many', ids };
}

export type Revocation =
  | { kind: 'ok'; tokens: FlyToken[] }
  | { kind: 'ambiguous'; tokens: FlyToken[] };

/**
 * The live tokens under the name, or the legacy name, except the one to keep.
 * Several live tokens under the legacy name can't be told apart from other
 * uses of it, so none of them is revoked.
 */
export function revokeSet(
  tokens: FlyToken[],
  { name, legacyName }: FlyNames,
  keep: string
): Revocation {
  const live = tokens.filter((token) => !token.revokedAt && token.id !== keep);
  const named = live.filter((token) => token.name === name);
  const legacy = legacyName
    ? live.filter((token) => token.name === legacyName)
    : [];
  if (legacy.length > 1) return { kind: 'ambiguous', tokens: legacy };
  return { kind: 'ok', tokens: [...named, ...legacy] };
}

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** The exit code of the hash script when the vault file or the key's line is not there yet */
export const NOT_READY = 3;

/** The script that prints the sha256 of the key's value; exits NOT_READY without the file or the key's line */
export const vaultLineScript = (
  key: FlyKey,
  file: string = VAULT_FILE
): string =>
  `[ -s ${file} ] && grep -q '^${key}=' ${file} || exit ${NOT_READY}; sed -n 's/^${key}=//p' ${file} | tr -d '\\n' | sha256sum | cut -d' ' -f1`;

/** The command that runs the script in a shell */
export const vaultLineHashCommand = (
  key: FlyKey,
  file: string = VAULT_FILE
): string[] => ['sh', '-c', vaultLineScript(key, file)];
