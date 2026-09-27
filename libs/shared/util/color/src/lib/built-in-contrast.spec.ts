import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { THEME_CONTRAST_PAIRS, checkContrast } from './contrast';
import { COLOR_FAMILIES, COLOR_SHADES, paletteColor, shade } from './palette';

/**
 * Every built-in theme has to pass its own contrast check — and be measurable.
 *
 * The platform's strongest claim is that an inaccessible colour theme cannot be
 * published on it, so a built-in that fails would make the claim false in the
 * most embarrassing way available. `frost` and `codeware` both failed the
 * focus ring in light mode until this test was written.
 *
 * The coverage assertion matters as much as the failure one. `checkContrast`
 * skips any pair whose colours it cannot parse, so an earlier version of this
 * suite passed a Spotlight fork while evaluating **none** of the 22 pairs. A
 * test that measures nothing reports success.
 */
const THEME_LIB = new URL('../../../../theme/src/lib/', import.meta.url);

const themeFile = (theme: string, name: string) =>
  readFileSync(new URL(`${theme}/${name}`, THEME_LIB), 'utf8');

/**
 * Every folder holding a theme, read from disk rather than listed.
 *
 * A list here would be one more place a new theme has to be remembered, and
 * forgetting it is silent: the theme ships unmeasured. `payload-admin` is left
 * out because it matches Payload's own chrome rather than making a claim.
 */
const BUILT_INS = readdirSync(THEME_LIB, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      entry.name !== 'payload-admin' &&
      existsSync(new URL(`${entry.name}/tokens-light.css`, THEME_LIB))
  )
  .map(({ name }) => name);

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
  // A theme generated from a recipe writes its white as `var(--color-white)`
  for (const name of ['white', 'black'] as const) {
    tokens[`--color-${name}`] = paletteColor(name);
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
    // version of this suite passed a Spotlight fork on zero pairs. Every pair,
    // not a floor: a partial count is a partial check that still says pass.
    it.each(['light', 'dark'] as const)('is measurable in %s', (scheme) => {
      const evaluated = checkContrast(tokensFor(theme, scheme)).length;

      expect(evaluated).toBe(THEME_CONTRAST_PAIRS.length);
    });
  });

  it('reads tokens rather than an empty object', () => {
    expect(Object.keys(tokensFor('frost', 'light')).length).toBeGreaterThan(20);
  });
});
