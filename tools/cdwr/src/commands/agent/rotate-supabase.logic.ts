import type { ApiKey } from '../../services/supabase-management';

/** The agent-host key the queue writes telemetry with */
export const SUPABASE_KEY = 'AGENT_SUPABASE_SERVICE_KEY';
export type SupabaseKey = typeof SUPABASE_KEY;

export const SUPABASE_URL_KEY = 'AGENT_SUPABASE_URL';

/** The host without a `user@`, so every way of reaching it names its keys the same */
const hostLabel = (host: string): string =>
  host.replace(/^.*@/, '').toLowerCase();

/**
 * The key this host gets, named for it and the time, so a rerun the same day
 * never collides. Letters, digits and `_` only, starting with a letter.
 */
export function keyNameOf(host: string, now: Date): string {
  const stamp = now
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, '')
    .replace('T', '_');
  const name = hostLabel(host).replace(/[^a-z0-9]+/g, '_');
  return `${/^[a-z]/.test(name) ? '' : 'host_'}${name}_${stamp}`;
}

/** The description a rotated key is created with, so a later run can find its leftovers */
export const descriptionOf = (host: string): string =>
  `cdwr: ${SUPABASE_KEY} ${hostLabel(host)}`;

/** A key the rotation must never delete: the shared default, or one another consumer holds */
function protectedKey(key: ApiKey, spare: readonly string[]): boolean {
  return key.name === 'default' || (!!key.hash && spare.includes(key.hash));
}

/**
 * The secret keys to delete: the one the vault held before (by hash) and any
 * an earlier run for the host left under its description. Never the one to
 * keep, a `default` key, or one whose hash another consumer holds (`spare`).
 * Other secret keys are returned and left alone.
 */
export function toDelete(
  keys: ApiKey[],
  opts: {
    keep: string;
    oldHash?: string;
    host: string;
    spare: readonly string[];
  }
): { remove: ApiKey[]; others: ApiKey[] } {
  const candidates = keys.filter(
    (key) => key.type === 'secret' && !!key.id && key.id !== opts.keep
  );
  const isOurs = (key: ApiKey) =>
    !protectedKey(key, opts.spare) &&
    ((!!opts.oldHash && key.hash === opts.oldHash) ||
      key.description === descriptionOf(opts.host));
  return {
    remove: candidates.filter(isOurs),
    others: candidates.filter((key) => !isOurs(key))
  };
}

const day = (date: string | null | undefined): string =>
  date ? date.slice(0, 10) : 'unknown date';

/** One line to recognise a key by: name, prefix, description and creation */
export function describeKey(key: ApiKey): string {
  const description = key.description ? ` "${key.description}"` : '';
  return `${key.name} (${key.prefix ?? key.type ?? 'key'}…)${description}, created ${day(key.inserted_at)}`;
}
