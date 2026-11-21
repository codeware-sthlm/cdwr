import { BUILT_IN_TOKENS } from '@codeware/shared/theme';
import {
  DEFAULT_RECIPE,
  buildThemeTokens,
  editableTokens,
  parseThemeTokens
} from '@codeware/shared/util/color';
import { describe, expect, it } from 'vitest';

import {
  describeRecipeChange,
  dropDerivedOverrides,
  droppedNames,
  mergeDropped,
  restoreDropped
} from './derived-overrides';
import type { ThemeOverrides } from './OverridePanel';

// Opened as the page embed opens it: the recipe plus every pinned token
const spotlight = parseThemeTokens(BUILT_IN_TOKENS['spotlight']);
const overrides = editableTokens(spotlight);
const before = buildThemeTokens(spotlight.recipe);

const change = (patch: Partial<typeof spotlight.recipe>) =>
  dropDerivedOverrides(
    overrides,
    before,
    buildThemeTokens({ ...spotlight.recipe, ...patch })
  );

const other = <T extends string>(current: T, options: ReadonlyArray<T>): T =>
  options.find((option) => option !== current) ?? current;

describe('dropDerivedOverrides', () => {
  it('opens with pinned tokens to drop', () => {
    expect(overrides.light['--card']).toBeDefined();
    expect(overrides.dark['--background']).toBeDefined();
  });

  it('drops what the base derives', () => {
    const { dropped } = change({
      baseFamily: other(spotlight.recipe.baseFamily, ['slate', 'stone'])
    });

    expect(dropped.light).toHaveProperty('--border');
    expect(dropped.dark).toHaveProperty('--background');
    expect(dropped.dark).toHaveProperty('--card');
  });

  it('drops what the brand derives', () => {
    const { dropped, kept } = change({
      brandFamily: other(spotlight.recipe.brandFamily, ['rose', 'emerald'])
    });

    expect(dropped.light).toHaveProperty('--links');
    // The spotlight primary follows the base, not the brand
    expect(dropped.dark).not.toHaveProperty('--primary');
    expect(kept.dark).toHaveProperty('--primary');
  });

  it('drops the primary once it follows the brand', () => {
    const { dropped } = change({ primarySource: 'brand' });

    expect(dropped.dark).toHaveProperty('--primary');
  });

  it('drops only surface tokens when the surface flips', () => {
    const { dropped, kept } = change({ surface: 'flat' });

    expect(dropped.light).toEqual({});
    expect(Object.keys(dropped.dark).sort()).toEqual([
      '--core-background-content',
      '--core-band-strong'
    ]);
    expect(kept.dark).toHaveProperty('--primary');
  });

  it('follows a var() chain to a pinned token', () => {
    const chained: ThemeOverrides = {
      light: {},
      dark: { '--core-surface-invert': '#112233' }
    };
    const derived = (card: string): ThemeOverrides => ({
      light: {},
      dark: { '--card': card, '--core-surface-invert': 'var(--card)' }
    });

    const { dropped } = dropDerivedOverrides(
      chained,
      derived('#000000'),
      derived('#ffffff')
    );

    expect(dropped.dark).toEqual({ '--core-surface-invert': '#112233' });
  });

  it('keeps an override the change does not touch', () => {
    const pinned: ThemeOverrides = { light: { '--radius': '1rem' }, dark: {} };
    const { kept, dropped } = dropDerivedOverrides(
      pinned,
      { light: { '--card': '#000' }, dark: {} },
      { light: { '--card': '#fff' }, dark: {} }
    );

    expect(kept).toEqual(pinned);
    expect(dropped).toEqual({ light: {}, dark: {} });
  });

  it('reads dark as the cascade does', () => {
    // Light moves, dark overrides it with the same value both times: unchanged
    const pinned: ThemeOverrides = { light: {}, dark: { '--card': '#222' } };
    const { dropped } = dropDerivedOverrides(
      pinned,
      { light: { '--card': '#000' }, dark: { '--card': '#222' } },
      { light: { '--card': '#fff' }, dark: { '--card': '#222' } }
    );

    expect(dropped.dark).toEqual({});
  });

  it('drops nothing for a no-op change', () => {
    const { kept, dropped } = change({});

    expect(dropped).toEqual({ light: {}, dark: {} });
    expect(kept).toEqual(overrides);
  });
});

describe('describeRecipeChange', () => {
  it('names a single field', () => {
    expect(
      describeRecipeChange(DEFAULT_RECIPE, {
        ...DEFAULT_RECIPE,
        surface: DEFAULT_RECIPE.surface === 'flat' ? 'layered' : 'flat'
      })
    ).toBe('Changing the surface');
  });

  it('falls back to the recipe for several fields or an unnamed one', () => {
    expect(
      describeRecipeChange(DEFAULT_RECIPE, {
        ...DEFAULT_RECIPE,
        radius: '0rem',
        brandFamily: 'rose'
      })
    ).toBe('Changing the recipe');
    expect(
      describeRecipeChange(DEFAULT_RECIPE, {
        ...DEFAULT_RECIPE,
        radius: '0rem'
      })
    ).toBe('Changing the recipe');
  });
});

describe('restoreDropped', () => {
  it('puts dropped tokens back and keeps a newer hand edit', () => {
    const restored = restoreDropped(
      { light: { '--card': '#abc' }, dark: {} },
      {
        light: { '--card': '#111', '--border': '#222' },
        dark: { '--primary': '#333' }
      }
    );

    expect(restored).toEqual({
      light: { '--card': '#abc', '--border': '#222' },
      dark: { '--primary': '#333' }
    });
  });
});

describe('droppedNames', () => {
  it('names a token once when both schemes lost it', () => {
    expect(
      droppedNames({
        light: { '--card': '#fff', '--border': '#eee' },
        dark: { '--card': '#111' }
      })
    ).toEqual(['--card', '--border']);
  });
});

describe('mergeDropped', () => {
  const first = {
    cause: 'Changing the base',
    tokens: { light: { '--border': '#eee' }, dark: { '--card': '#111' } }
  };

  it('takes the first drop as it is', () => {
    expect(mergeDropped(null, first)).toBe(first);
  });

  it('keeps an earlier drop restorable after a later one', () => {
    const merged = mergeDropped(first, {
      cause: 'Changing the brand',
      tokens: { light: { '--border': '#ddd' }, dark: { '--links': '#0af' } }
    });
    expect(merged).toEqual({
      cause: 'Changes to the recipe',
      tokens: {
        light: { '--border': '#ddd' },
        dark: { '--card': '#111', '--links': '#0af' }
      }
    });
  });
});
