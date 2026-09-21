import { describe, expect, it } from 'vitest';

import { DEFAULT_RECIPE, buildThemeTokens } from './build-theme-tokens';
import {
  THEME_CONTRAST_PAIRS,
  WCAG_AA_NORMAL,
  checkContrast,
  contrastFailures,
  unreadableTokens
} from './contrast';
import { COLOR_FAMILIES, NEUTRAL_FAMILIES } from './palette';

/**
 * Every family a theme can be branded with.
 *
 * The studio offers the neutrals as brands too, so a hand-kept list here would
 * quietly stop covering what the studio can actually produce.
 */
const BRAND_FAMILIES = COLOR_FAMILIES;

/** Dark holds only what changes, so it is checked as the browser cascades it. */
const schemes = (recipe = DEFAULT_RECIPE) => {
  const { light, dark } = buildThemeTokens(recipe);
  return { light, dark: { ...light, ...dark } };
};

describe('checkContrast', () => {
  it('resolves aliases before comparing', () => {
    // `--core-link` and `--core-background-content` are both aliases; a checker
    // that compared the literal `var(…)` strings would report nothing at all
    const results = checkContrast(schemes().light);
    const link = results.find(({ usage }) => usage === 'Links in body copy');

    expect(link).toBeDefined();
    expect(link?.ratio).toBeGreaterThan(1);
  });

  it('leaves out a pair whose colour cannot be read', () => {
    const results = checkContrast({ '--foreground': 'oklch(0 0 0)' });

    // Only tokens present and parseable are reported — never as passes
    expect(results).toEqual([]);
  });

  it('drops a pair rather than looping on a circular alias', () => {
    const results = checkContrast({
      '--foreground': 'var(--background)',
      '--background': 'var(--foreground)'
    });

    expect(results).toEqual([]);
  });

  it('reports every pair it can read', () => {
    const results = checkContrast(schemes().light);
    expect(results.length).toBe(THEME_CONTRAST_PAIRS.length);
  });

  it('flags a pair that fails its minimum', () => {
    const barely = {
      ...schemes().light,
      '--foreground': 'oklch(0.95 0 0)'
    };
    const failures = contrastFailures(barely);

    expect(failures.map(({ usage }) => usage)).toContain('Body text');
    expect(failures[0].minimum).toBe(WCAG_AA_NORMAL);
  });
});

describe('the default recipe', () => {
  it.each(['light', 'dark'] as const)('passes WCAG AA in %s', (scheme) => {
    const failures = contrastFailures(schemes()[scheme]);

    expect(failures.map((f) => `${f.usage}: ${f.ratio.toFixed(2)}`)).toEqual(
      []
    );
  });
});

// The brand now drives buttons, rings and links, so a family that cannot carry
// them would ship an unreadable theme by default rather than on an odd choice
describe('every brand family', () => {
  it.each(BRAND_FAMILIES)('passes WCAG AA with %s', (brandFamily) => {
    const built = schemes({ ...DEFAULT_RECIPE, brandFamily });
    const failures = [
      ...contrastFailures(built.light).map((f) => `light ${f.usage}`),
      ...contrastFailures(built.dark).map((f) => `dark ${f.usage}`)
    ];

    expect(failures).toEqual([]);
  });
});

// A tinted neutral moves every surface, border and secondary text at once, so
// a base that cannot carry them is as unshippable as a brand that cannot
describe('every base family', () => {
  it.each(NEUTRAL_FAMILIES)('passes WCAG AA with %s', (baseFamily) => {
    const built = schemes({ ...DEFAULT_RECIPE, baseFamily });
    const failures = [
      ...contrastFailures(built.light).map((f) => `light ${f.usage}`),
      ...contrastFailures(built.dark).map((f) => `dark ${f.usage}`)
    ];

    expect(failures).toEqual([]);
  });
});

describe('unreadableTokens', () => {
  const readable = {
    '--foreground': 'oklch(0.2 0 0)',
    '--background': '#ffffff'
  };

  it('says nothing about a theme it can read', () => {
    expect(unreadableTokens(readable)).toEqual([]);
  });

  it('ignores absent tokens, which a custom theme inherits', () => {
    // The gap this does NOT close: a partial theme is legitimate, so saying
    // nothing about a token cannot be an error
    expect(unreadableTokens({})).toEqual([]);
  });

  it.each([
    ['transparent', 'transparent'],
    ['a named colour', 'red'],
    ['hsl()', 'hsl(0 0% 100%)'],
    ['rgb()', 'rgb(0 0 0)'],
    ['color-mix()', 'color-mix(in oklch, red 50%, blue)'],
    ["Tailwind's build-time theme()", "theme('colors.white / 0.9')"]
  ])(
    'catches %s, which the whitelist allows but the check cannot read',
    (_label, value) => {
      const found = unreadableTokens({ ...readable, '--foreground': value });

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ token: '--foreground', value });
    }
  );

  it('reports a token once, not once per pair that needs it', () => {
    // `--background` is the surface for many pairs
    const found = unreadableTokens({
      ...readable,
      '--background': 'transparent'
    });

    expect(found.filter(({ token }) => token === '--background')).toHaveLength(
      1
    );
  });

  it('follows an alias before judging it', () => {
    const viaAlias = {
      ...readable,
      '--foreground': 'var(--brand)',
      '--brand': 'hsl(0 0% 0%)'
    };

    expect(unreadableTokens(viaAlias)).toMatchObject([
      { token: '--foreground', value: 'hsl(0 0% 0%)' }
    ]);
  });

  it('is what makes the contrast check non-vacuous', () => {
    // The bug it exists for: an unreadable pair is skipped, so the theme
    // reports no failures while being measured on nothing
    const unreadableTheme = {
      '--foreground': 'transparent',
      '--background': 'transparent'
    };

    expect(contrastFailures(unreadableTheme)).toEqual([]);
    expect(unreadableTokens(unreadableTheme).length).toBeGreaterThan(0);
  });
});
