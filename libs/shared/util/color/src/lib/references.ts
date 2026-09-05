import type { ThemeTokens } from './build-theme-tokens';

/** A `var()` in a token value that does not lead to a colour. */
export type BrokenReference = {
  /** The token holding the reference */
  token: string;
  /** What it points at */
  reference: string;
  reason: 'undefined' | 'cycle';
};

const REFERENCE = /var\(\s*(--[\w-]+)\s*\)/g;

const referencesIn = (value: string): Array<string> =>
  [...value.matchAll(REFERENCE)].map((match) => match[1]);

/**
 * Whether a token eventually reaches a value that is not another reference.
 *
 * A chain that revisits a name can never terminate, so it is a break rather
 * than a deep alias.
 */
function resolves(
  tokens: ThemeTokens,
  name: string,
  seen: Set<string>
): boolean {
  if (seen.has(name)) {
    return false;
  }
  const value = tokens[name];
  if (value === undefined) {
    return false;
  }

  seen.add(name);

  return referencesIn(value).every((next) =>
    resolves(tokens, next, new Set(seen))
  );
}

/**
 * Find `var()` references that lead nowhere.
 *
 * The value whitelist only judges characters, so `var(--backgroundx)` passes it
 * happily — it is well-formed CSS. The browser then resolves it to nothing and
 * the token is simply absent, which on a surface token means an unpainted page.
 * Nothing else catches this: a missing colour is not a contrast failure, it is
 * the absence of one.
 *
 * Pass the map the browser will actually see — for dark, that is dark merged
 * over light, since a dark token may alias one only light defines.
 *
 * @param tokens - The resolved token map for one scheme
 * @returns One entry per broken reference, empty when every alias lands
 */
export function brokenReferences(tokens: ThemeTokens): Array<BrokenReference> {
  const broken: Array<BrokenReference> = [];

  for (const [token, value] of Object.entries(tokens)) {
    for (const reference of referencesIn(value)) {
      if (tokens[reference] === undefined) {
        broken.push({ token, reference, reason: 'undefined' });
      } else if (!resolves(tokens, reference, new Set([token]))) {
        broken.push({ token, reference, reason: 'cycle' });
      }
    }
  }

  return broken;
}

/**
 * Follow `var(--x)` until a token holds a real colour.
 *
 * The core and prose layers are aliases by design, so almost every token worth
 * reading a colour off points at another token rather than a value. A cycle or
 * a dead end resolves to `null` rather than looping.
 *
 * @param tokens - The map the browser will see; for dark, that is dark over light
 * @param name - The token to read
 * @returns The value at the end of the chain, or `null`
 */
export function resolveToken(
  tokens: ThemeTokens,
  name: string,
  seen = new Set<string>()
): string | null {
  if (seen.has(name)) {
    return null;
  }
  seen.add(name);

  const value = tokens[name];
  if (!value) {
    return null;
  }

  const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim());
  return alias ? resolveToken(tokens, alias[1], seen) : value;
}
