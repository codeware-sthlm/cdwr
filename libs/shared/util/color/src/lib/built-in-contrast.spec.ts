import { readFileSync } from 'node:fs';

import { THEME_CONTRAST_PAIRS, checkContrast } from './contrast';
import { COLOR_FAMILIES, COLOR_SHADES, shade } from './palette';

/**
 * Every built-in theme has to pass its own contrast check — and be measurable.
 *
 * The platform's strongest claim is that an inaccessible colour theme cannot be
 * published on it, so a built-in that fails would make the claim false in the
 * most embarrassing way available. `shadcn` and `codeware` both failed the
 * focus ring in light mode until this test was written.
 *
 * The coverage assertion matters as much as the failure one. `checkContrast`
 * skips any pair whose colours it cannot parse, so an earlier version of this
 * suite passed `spotlight-fork` while evaluating **none** of the 22 pairs. A
 * test that measures nothing reports success.
 */
const themeFile = (theme: string, name: string) =>
  readFileSync(
    new URL(`../../../../theme/src/lib/${theme}/${name}`, import.meta.url),
    'utf8'
  );

const BUILT_INS = ['shadcn', 'spotlight', 'spotlight-fork', 'codeware'];

/**
 * The Tailwind palette, as tokens.
 *
 * `spotlight` reaches the palette directly (`var(--color-zinc-900)`), which the
 * theme's own stylesheet cannot resolve. Without this every pair referencing it
 * is skipped and the theme passes unmeasured.
 */
const paletteTokens = (): Record<string, string> => {
  const tokens: Record<string, string> = {};
  for (const family of COLOR_FAMILIES) {
    for (const step of COLOR_SHADES) {
      tokens[`--color-${family}-${step}`] = shade(family, step);
    }
  }
  return tokens;
};

/** Pull `--token: value` declarations out of a token stylesheet. */
const declarations = (css: string): Record<string, string> => {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi
  )) {
    tokens[name] = value.trim();
  }
  return tokens;
};

const tokensFor = (theme: string, scheme: 'light' | 'dark') => {
  const light = declarations(themeFile(theme, 'tokens-light.css'));

  // Dark is read merged over light, the way the browser cascades it
  const own =
    scheme === 'light'
      ? light
      : { ...light, ...declarations(themeFile(theme, 'tokens-dark.css')) };

  return { ...paletteTokens(), ...own };
};

describe('built-in themes', () => {
  describe.each(BUILT_INS)('%s', (theme) => {
    it.each(['light', 'dark'] as const)('passes contrast in %s', (scheme) => {
      const failing = checkContrast(tokensFor(theme, scheme))
        .filter(({ passes }) => !passes)
        .map(
          ({ usage, ratio, minimum }) =>
            `${usage} ${ratio.toFixed(2)}/${minimum}`
        );

      expect(failing).toEqual([]);
    });

    // Guards the assertion above: a theme whose colours cannot be parsed would
    // pass it while being checked on nothing at all, which is how an earlier
    // version of this suite passed `spotlight-fork` on zero pairs.
    //
    // Not all 22: `spotlight` writes some tokens as Tailwind's build-time
    // `theme('colors.white / 0.9')`, which has no meaning at runtime and
    // cannot be read here. That caps it around 13 and is a known gap rather
    // than a target — the floor exists to catch a collapse, not to bless the
    // shortfall.
    it.each(['light', 'dark'] as const)('is measurable in %s', (scheme) => {
      const evaluated = checkContrast(tokensFor(theme, scheme)).length;

      expect(evaluated).toBeGreaterThanOrEqual(13);
    });
  });

  it('reads tokens rather than an empty object', () => {
    expect(Object.keys(tokensFor('shadcn', 'light')).length).toBeGreaterThan(
      20
    );
  });
});
