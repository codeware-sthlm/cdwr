import * as core from '@actions/core';

/**
 * Rule for every GitHub Action: any value an action logs goes through
 * `redactConfig` first, and any secret an action fetches or receives is
 * passed to `maskSecrets` before it can reach a log line. Add a key pattern
 * here rather than special-casing a log site.
 */
export const SENSITIVE_KEY_PATTERN =
  /secret|token|password|passwd|api[-_]?key|dsn|authorization|cookie|credential|private[-_]?key/i;

const REDACTED = '[redacted]';

const NAME_VALUE = /^([^=\s]+)=([\s\S]*)$/;

/** A secret shorter than this is not masked */
const MIN_MASK_LENGTH = 6;

/** `listItem` is true for an item of an array, where `NAME=value` is an env-style entry */
type Leaf = (value: string, listItem: boolean) => string;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Deep copy of `value` where every string or number beneath a sensitive key
 * goes through `leaf`, a number as its string.
 */
const transform = (
  value: unknown,
  sensitive: boolean,
  listItem: boolean,
  leaf: Leaf
): unknown => {
  if (typeof value === 'string' || typeof value === 'number') {
    return sensitive ? leaf(String(value), listItem) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transform(item, sensitive, true, leaf));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        transform(
          child,
          sensitive || SENSITIVE_KEY_PATTERN.test(key),
          false,
          leaf
        )
      ])
    );
  }
  return value;
};

/**
 * Returns a deep copy of `value` with the values of sensitive keys redacted.
 *
 * A string or number under a matching key becomes `[redacted]` (an empty
 * string stays empty). An object or array under a matching key has every
 * leaf redacted, keeping its keys; an array item `NAME=value` (an env-style
 * list such as `secrets`) keeps `NAME=`. Anywhere else a value is redacted
 * whole, since a secret such as a database url or base64 can hold `=`.
 * Never mutates the input.
 */
export const redactConfig = <T>(value: T): T =>
  transform(value, false, false, (text, listItem) => {
    if (text === '') return text;
    const match = listItem ? NAME_VALUE.exec(text) : null;
    if (!match) return REDACTED;
    return match[2] === '' ? text : `${match[1]}=${REDACTED}`;
  }) as T;

/**
 * Masks each value in the GitHub Actions log.
 *
 * Values shorter than 6 characters are skipped: GitHub masks every
 * occurrence, so a short value such as `cms` blanks unrelated log text
 * (COD-381). Real secrets are longer.
 */
export const maskSecrets = (
  values: Iterable<string | undefined | null>
): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length < MIN_MASK_LENGTH) {
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    core.setSecret(value);
  }
};

/**
 * Masks every value `redactConfig` would redact. For a `NAME=value` array
 * item only the part after `=` is masked.
 */
export const maskSecretsIn = (value: unknown): void => {
  const found: string[] = [];
  transform(value, false, false, (text, listItem) => {
    const match = listItem ? NAME_VALUE.exec(text) : null;
    found.push(match ? match[2] : text);
    return text;
  });
  maskSecrets(found);
};
