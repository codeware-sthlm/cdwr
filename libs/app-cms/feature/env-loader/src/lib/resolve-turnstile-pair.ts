export const TURNSTILE_KEYS = [
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY'
] as const;

export type TurnstileKey = (typeof TURNSTILE_KEYS)[number];

/** The Turnstile keys one source sets, named after where they came from. */
export type TurnstileSource = {
  /** Folder path, or `the environment` for what was set before Infisical */
  source: string;
  /** Null when the folder could not be read */
  keys: Partial<Record<TurnstileKey, string | undefined>> | null;
};

export type TurnstilePair = Partial<Record<TurnstileKey, string>> & {
  /** Where the pair came from, undefined when no source sets either key */
  source?: string;
  /** The folder that could not be read, which left no pair */
  unreadable?: string;
};

/**
 * Pick the Turnstile pair from the first source that sets either key.
 *
 * Sources come highest precedence first. The pair is resolved as one unit:
 * both halves come from the same source, so a tenant that sets one half never
 * borrows the other from the shared folder. A widget's secret only verifies its
 * own widget's tokens, so a mixed pair would fail on every submission. A half
 * pair is returned as it is, and the schema reports the missing half.
 *
 * A source that could not be read stops the search with no pair: it may hold
 * the tenant's own, and a lower pair would be drawn on hostnames its widget
 * doesn't list, failing every submission.
 */
export const resolveTurnstilePair = (
  sources: Array<TurnstileSource>
): TurnstilePair => {
  for (const { source, keys } of sources) {
    if (!keys) {
      return { unreadable: source };
    }
    if (!TURNSTILE_KEYS.some((key) => keys[key])) {
      continue;
    }

    const pair: TurnstilePair = { source };
    for (const key of TURNSTILE_KEYS) {
      if (keys[key]) {
        pair[key] = keys[key];
      }
    }
    return pair;
  }
  return {};
};
