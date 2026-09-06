import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECIPE,
  type ThemeRecipe,
  buildThemeTokens
} from './build-theme-tokens';
import { parseTheme } from './parse-theme';
import { themeFiles } from './theme-export';

const themeFile = (theme: string, name: string) =>
  readFileSync(
    new URL(`../../../../theme/src/lib/${theme}/${name}`, import.meta.url),
    'utf8'
  );

const committed = (theme: string) => ({
  'tokens-light.css': themeFile(theme, 'tokens-light.css'),
  'tokens-dark.css': themeFile(theme, 'tokens-dark.css')
});

const recipe = (overrides: Partial<ThemeRecipe> = {}): ThemeRecipe => ({
  ...DEFAULT_RECIPE,
  ...overrides
});

describe('parseTheme', () => {
  /**
   * The test that matters: anything the generator can emit, the parser must
   * read back as the decisions that emitted it — with nothing left over.
   */
  describe('round-trips the generator', () => {
    const RECIPES: Array<[string, ThemeRecipe]> = [
      ['the default', recipe()],
      [
        'a brand on a tinted base',
        recipe({ baseFamily: 'stone', brandFamily: 'violet' })
      ],
      [
        'a shadcn neutral base',
        recipe({ baseFamily: 'mauve', brandFamily: 'teal' })
      ],
      ['a layered surface', recipe({ surface: 'layered', radius: '1rem' })],
      ['a flat surface', recipe({ surface: 'flat', radius: '0' })],
      [
        'a neutral primary',
        recipe({ primarySource: 'base', brandFamily: 'rose' })
      ],
      ['shadcn charts', recipe({ chartSource: 'shadcn', brandFamily: 'sky' })],
      [
        'greyscale charts',
        recipe({ chartSource: 'base', baseFamily: 'slate' })
      ],
      ['links following the primary', recipe({ linkSource: 'primary' })],
      [
        'links on their own step',
        recipe({ linkShade: { light: '600', dark: '300' } })
      ],
      [
        'every source at once',
        recipe({
          baseFamily: 'taupe',
          brandFamily: 'emerald',
          surface: 'layered',
          primarySource: 'base',
          chartSource: 'shadcn',
          linkSource: 'primary',
          fontHeading: 'system'
        })
      ]
    ];

    it.each(RECIPES)('recovers %s', (_label, source) => {
      const parsed = parseTheme(themeFiles('probe', source));

      expect(parsed.recipe).toEqual(source);
      expect(parsed.overrides).toEqual({ light: {}, dark: {} });
      expect(parsed.passthrough).toEqual({ light: {}, dark: {} });
      expect(parsed.unresolved).toEqual([]);
    });

    // A recipe the parser recovers but whose tokens it rebuilds differently
    // would round-trip on paper and reopen as a different theme
    it.each(RECIPES)('rebuilds %s identically', (_label, source) => {
      const parsed = parseTheme(themeFiles('probe', source));

      expect(buildThemeTokens(parsed.recipe, parsed.overrides)).toEqual(
        buildThemeTokens(source)
      );
    });

    it('carries a hand-edited token back out', () => {
      const overrides = {
        light: { '--muted-foreground': 'oklch(0.536 0 0)' },
        dark: {}
      };
      const parsed = parseTheme(themeFiles('probe', recipe(), overrides));

      expect(parsed.recipe).toEqual(recipe());
      expect(parsed.overrides.light['--muted-foreground']).toBe(
        'oklch(0.536 0 0)'
      );
    });
  });

  /**
   * The committed themes, pinned.
   *
   * A regression in either direction is worth seeing: fewer means the template
   * grew to cover something, more means it stopped.
   *
   * `spotlight` is most of the way to its own token count because it restates
   * thirty-five core and prose tokens in dark, where the template declares them
   * once and lets them cascade. That is its dark personality, and carrying it
   * is what makes a fork of it look like it. Its 24 unresolved values are all
   * build-time `theme()` calls; the three dangling aliases it used to carry are
   * fixed.
   *
   * `codeware` and `payload-admin` sit above the count a pure best-fit search
   * reaches, deliberately. Fitting for the smallest pile alone reads
   * `codeware`'s links as following the primary, which is not what it says —
   * it sets `--core-link: var(--brand-600)` and then points prose links
   * somewhere else. Recovering the decision it actually made costs four
   * overrides and is the more useful answer.
   */
  describe('reads the committed themes', () => {
    it.each([
      ['shadcn', 3, 0],
      ['codeware', 8, 6],
      ['payload-admin', 7, 2],
      ['spotlight', 92, 0]
    ])('explains %s with %i overrides', (theme, overrides, passthrough) => {
      const parsed = parseTheme(committed(theme));
      const count = (block: { light: object; dark: object }) =>
        Object.keys(block.light).length + Object.keys(block.dark).length;

      expect(count(parsed.overrides)).toBe(overrides);
      expect(count(parsed.passthrough)).toBe(passthrough);
    });

    it.each([
      ['shadcn', { baseFamily: 'neutral', brandFamily: 'zinc' }],
      ['codeware', { baseFamily: 'zinc', brandFamily: 'blue' }],
      ['spotlight', { baseFamily: 'zinc', brandFamily: 'teal' }],
      ['payload-admin', { baseFamily: 'zinc', brandFamily: 'yale-blue' }]
    ])('recovers the families of %s', (theme, expected) => {
      const { recipe: parsed } = parseTheme(committed(theme));

      expect(parsed.baseFamily).toBe(expected.baseFamily);
      expect(parsed.brandFamily).toBe(expected.brandFamily);
    });

    // Its ramp is a bespoke Codeware blue that no palette ships, so it is one
    // we ship ourselves — `yale-blue`. Before it had a name the parser fell back to
    // `neutral` and reported all eleven steps as overrides, which showed a
    // brand swatch that was a lie and a brand control that did nothing
    it('names the hand-cut ramp rather than overriding it', () => {
      const { recipe: parsed, overrides } = parseTheme(
        committed('payload-admin')
      );

      expect(parsed.brandFamily).toBe('yale-blue');
      expect(parsed.brandFamily).not.toBe(DEFAULT_RECIPE.brandFamily);
      expect(
        Object.keys(overrides.light).filter((token) =>
          token.startsWith('--brand-')
        )
      ).toHaveLength(0);
    });

    // `--core-link: var(--brand-600)` is an exact match where following the
    // primary is only a colour match, and the file says which was meant
    it('reads codeware link decision off what it wrote', () => {
      const { recipe: parsed } = parseTheme(committed('codeware'));

      expect(parsed.linkSource).toBe('brand');
      expect(parsed.linkShade.light).toBe('600');
    });

    it('recovers the radius spotlight sets apart from the others', () => {
      expect(parseTheme(committed('spotlight')).recipe.radius).toBe('0.5rem');
      expect(parseTheme(committed('shadcn')).recipe.radius).toBe('0.625rem');
    });

    // The six brand hexes `codeware`'s tailwind-base.css maps through
    // `@theme inline` — losing them breaks its build, not just its colour
    it('keeps the declarations the template never generates', () => {
      const { passthrough } = parseTheme(committed('codeware'));

      expect(Object.keys(passthrough.light)).toEqual([
        '--steel-blue',
        '--yale-blue',
        '--space-cadet',
        '--light-gray',
        '--eerie-black',
        '--darker-black'
      ]);
    });

    // Not a value until Tailwind resolves it, and not on the runtime whitelist
    // either — a caller has to be told rather than shipped a dead token
    it('reports spotlight build-time calls rather than swallowing them', () => {
      const calls = parseTheme(committed('spotlight')).unresolved.filter(
        ({ reason }) => reason === 'build-time-call'
      );

      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every(({ value }) => value.includes('theme('))).toBe(true);
    });

    // Synthetic rather than read off a committed theme: `spotlight` carried
    // three of these until they were fixed, and pinning the behaviour to a bug
    // means the test disappears the moment the bug does
    it('reports a var() naming no palette entry', () => {
      const { unresolved } = parseTheme({
        'tokens-light.css': `:root {
          --brand-600: var(--color-teal-600);
          --links: var(--color-brand-600);
        }`,
        'tokens-dark.css': '.dark { }'
      });

      expect(
        unresolved.filter(({ reason }) => reason === 'unknown-reference')
      ).toEqual([
        {
          scheme: 'light',
          token: '--links',
          value: 'var(--color-brand-600)',
          reason: 'unknown-reference'
        }
      ]);
    });

    // The fix to those three, guarded: `--color-brand-600` is nothing, and the
    // token meant was `--brand-600`
    it('finds no dangling palette reference in any built-in', () => {
      for (const theme of [
        'shadcn',
        'codeware',
        'payload-admin',
        'spotlight'
      ]) {
        expect(
          parseTheme(committed(theme)).unresolved.filter(
            ({ reason }) => reason === 'unknown-reference'
          )
        ).toEqual([]);
      }
    });

    it('finds no build-time call in the other three', () => {
      for (const theme of ['shadcn', 'codeware', 'payload-admin']) {
        expect(parseTheme(committed(theme)).unresolved).toEqual([]);
      }
    });

    /**
     * An override holding `var(--color-…)` resolves to nothing once the theme
     * is injected at runtime, because Tailwind only emits the shades something
     * referenced at build time. The parser reads alias-form files, so this is
     * the seam where that would leak in.
     */
    it('never leaves a palette alias in an override', () => {
      for (const theme of [
        'shadcn',
        'codeware',
        'payload-admin',
        'spotlight'
      ]) {
        const { overrides, unresolved } = parseTheme(committed(theme));
        const reported = new Set(unresolved.map(({ token }) => token));

        const leaked = [
          ...Object.entries(overrides.light),
          ...Object.entries(overrides.dark)
        ].filter(
          // One naming no entry cannot be rewritten, only reported — and is
          ([token, value]) => value.includes('--color-') && !reported.has(token)
        );

        expect(leaked).toEqual([]);
      }
    });
  });

  describe('survives what a file may not carry', () => {
    it('falls back when the brand ramp is missing', () => {
      const parsed = parseTheme({
        'tokens-light.css': ':root { --foreground: oklch(0.145 0 0); }',
        'tokens-dark.css': '.dark { }'
      });

      expect(parsed.recipe.brandFamily).toBe(DEFAULT_RECIPE.brandFamily);
      expect(parsed.recipe.radius).toBe(DEFAULT_RECIPE.radius);
    });

    it('reads nothing out of an empty pair without throwing', () => {
      expect(() =>
        parseTheme({ 'tokens-light.css': '', 'tokens-dark.css': '' })
      ).not.toThrow();
    });
  });
});
