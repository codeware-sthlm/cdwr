import type { ThemeRecipe, ThemeTokens } from '@codeware/shared/util/color';

import type { ThemeOverrides } from './OverridePanel';

const SCHEMES = ['light', 'dark'] as const;

const REFERENCE = /var\(\s*(--[\w-]+)/g;

/** What the browser resolves per scheme: dark is read over light. */
const effective = (
  tokens: ThemeOverrides,
  scheme: (typeof SCHEMES)[number]
): ThemeTokens =>
  scheme === 'dark' ? { ...tokens.light, ...tokens.dark } : tokens.light;

/** Tokens whose derived value moved, directly or through a `var()` chain. */
function changedTokens(before: ThemeTokens, after: ThemeTokens): Set<string> {
  const changed = new Set(
    [...Object.keys(before), ...Object.keys(after)].filter(
      (name) => before[name] !== after[name]
    )
  );

  const follows = (value: string | undefined) =>
    [...(value ?? '').matchAll(REFERENCE)].some(([, name]) =>
      changed.has(name)
    );

  // A chain can be as long as the tokens are deep, so go until nothing joins
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of new Set([
      ...Object.keys(before),
      ...Object.keys(after)
    ])) {
      if (
        !changed.has(name) &&
        (follows(before[name]) || follows(after[name]))
      ) {
        changed.add(name);
        grew = true;
      }
    }
  }

  return changed;
}

/**
 * Split overrides into those a recipe change leaves alone and those the new
 * recipe now derives differently.
 *
 * `before` and `after` are the generated maps (no overrides) of the old and
 * new recipe. A pinned token whose derived value moved no longer follows what
 * the author changed, which is why it is dropped rather than kept.
 */
export function dropDerivedOverrides(
  overrides: ThemeOverrides,
  before: ThemeOverrides,
  after: ThemeOverrides
): { kept: ThemeOverrides; dropped: ThemeOverrides } {
  const kept: ThemeOverrides = { light: {}, dark: {} };
  const dropped: ThemeOverrides = { light: {}, dark: {} };

  for (const scheme of SCHEMES) {
    const changed = changedTokens(
      effective(before, scheme),
      effective(after, scheme)
    );

    for (const [name, value] of Object.entries(overrides[scheme])) {
      (changed.has(name) ? dropped : kept)[scheme][name] = value;
    }
  }

  return { kept, dropped };
}

/** What a recipe change took from the author, kept so it can be given back. */
export type DroppedOverrides = {
  /** The subject of the notice, e.g. "Changing the base" */
  cause: string;
  tokens: ThemeOverrides;
};

export const countOverrides = (overrides: ThemeOverrides) =>
  Object.keys(overrides.light).length + Object.keys(overrides.dark).length;

/** The dropped token names, once each however many schemes lost them. */
export const droppedNames = (tokens: ThemeOverrides): Array<string> => [
  ...new Set([...Object.keys(tokens.light), ...Object.keys(tokens.dark)])
];

/**
 * Add a later drop to one not yet restored or dismissed, so Restore still
 * gives back the earlier edits. A token edited again and dropped again takes
 * its newer value.
 */
export function mergeDropped(
  earlier: DroppedOverrides | null,
  later: DroppedOverrides
): DroppedOverrides {
  if (!earlier) return later;

  return {
    cause: 'Changes to the recipe',
    tokens: {
      light: { ...earlier.tokens.light, ...later.tokens.light },
      dark: { ...earlier.tokens.dark, ...later.tokens.dark }
    }
  };
}

// Exhaustive, so a recipe field added later has to say what it is called
const FIELD_LABEL: Record<keyof ThemeRecipe, string> = {
  baseFamily: 'the base',
  brandFamily: 'the brand',
  surface: 'the surface',
  radius: 'the recipe',
  linkShade: 'the recipe',
  fontBody: 'the recipe',
  fontHeading: 'the recipe',
  primarySource: 'the recipe',
  chartSource: 'the recipe',
  linkSource: 'the recipe'
};

/** The subject of the notice: one named field, or the recipe as a whole. */
export function describeRecipeChange(
  current: ThemeRecipe,
  next: ThemeRecipe
): string {
  const was = new Map(Object.entries(current));
  const names = new Map(Object.entries(FIELD_LABEL));
  const labels = new Set(
    Object.entries(next)
      .filter(
        ([field, value]) =>
          JSON.stringify(value) !== JSON.stringify(was.get(field))
      )
      .map(([field]) => names.get(field) ?? 'the recipe')
  );
  const [only] = labels;

  return `Changing ${labels.size === 1 && only ? only : 'the recipe'}`;
}

/**
 * Put dropped overrides back, except where the author has since edited the
 * same token: the current value is newer than the one being restored.
 */
export function restoreDropped(
  overrides: ThemeOverrides,
  dropped: ThemeOverrides
): ThemeOverrides {
  return {
    light: { ...dropped.light, ...overrides.light },
    dark: { ...dropped.dark, ...overrides.dark }
  };
}
