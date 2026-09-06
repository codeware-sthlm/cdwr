import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECIPE,
  type ThemeRecipe,
  type ThemeTokens,
  buildThemeTokens
} from './build-theme-tokens';
import { parseColor } from './oklch';
import { paletteColor, shade } from './palette';
import { BASE_CHART_SHADES, SHADCN_CHARTS } from './theme-template';

const coreFile = (name: string) =>
  readFileSync(
    new URL(`../../../../theme/src/lib/_core/${name}`, import.meta.url),
    'utf8'
  );

/**
 * The token contract, derived the way `theme-sync` derives it.
 *
 * Read from the contract files rather than restated, so a token added to
 * `@theme inline` or the prose plugin fails this suite instead of shipping a
 * theme that silently misses it.
 */
const contract = () => {
  // Comments stripped first, exactly as `theme-sync` does — a comment naming a
  // variable is prose about it, and counting one would require every theme to
  // define a token nothing actually maps
  const setupCss = coreFile('tailwind-setup.css').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  const proseJs = coreFile('typography-prose.js');

  const setup = new Set<string>();
  for (const block of setupCss.matchAll(/@theme\s+inline\s*\{([\s\S]*?)\}/g)) {
    for (const ref of block[1].matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)) {
      setup.add(ref[1]);
    }
  }
  const prose = new Set(
    [...proseJs.matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((m) => m[1])
  );

  return {
    light: new Set([...setup, ...prose]),
    // Brand, core and radius cascade from the light block
    dark: new Set(
      [...setup].filter(
        (token) =>
          !token.startsWith('--brand-') &&
          !token.startsWith('--core-') &&
          token !== '--radius'
      )
    )
  };
};

const recipe = (overrides: Partial<ThemeRecipe> = {}): ThemeRecipe => ({
  ...DEFAULT_RECIPE,
  ...overrides
});

describe('buildThemeTokens', () => {
  describe('satisfies the generator contract', () => {
    const { light, dark } = contract();
    const built = buildThemeTokens(recipe({ brandFamily: 'teal' }));

    it('defines every required light token', () => {
      const missing = [...light].filter((token) => !built.light[token]).sort();
      expect(missing).toEqual([]);
    });

    it('defines every required dark token', () => {
      const missing = [...dark].filter((token) => !built.dark[token]).sort();
      expect(missing).toEqual([]);
    });

    // Guards the test itself: a contract that parsed to nothing would pass the
    // two above without checking anything
    it('reads a contract of the expected size', () => {
      expect(light.size).toBe(88);
      expect(dark.size).toBe(32);
    });
  });

  describe('emits values a stylesheet can use', () => {
    const built = buildThemeTokens(recipe({ brandFamily: 'blue' }));

    // Tailwind emits only the palette shades referenced at build time, so an
    // injected theme aliasing one would resolve to nothing
    it('never references the Tailwind palette', () => {
      const values = [
        ...Object.values(built.light),
        ...Object.values(built.dark)
      ];
      expect(values.filter((value) => value.includes('--color-'))).toEqual([]);
    });

    it('resolves the brand ramp to literals', () => {
      expect(parseColor(built.light['--brand-600'])).not.toBeNull();
      expect(built.light['--brand-600']).toBe(
        built.light['--brand-600'].trim()
      );
    });

    it('keeps the core and prose layers as aliases', () => {
      expect(built.light['--core-text']).toBe('var(--foreground)');
      expect(built.light['--body']).toBe('var(--foreground)');
    });
  });

  describe('the recipe', () => {
    it('drives every neutral from the base family', () => {
      const zinc = buildThemeTokens(recipe({ baseFamily: 'zinc' }));
      const stone = buildThemeTokens(recipe({ baseFamily: 'stone' }));

      expect(zinc.light['--foreground']).not.toBe(stone.light['--foreground']);
      expect(zinc.light['--muted']).not.toBe(stone.light['--muted']);
      expect(zinc.dark['--background']).not.toBe(stone.dark['--background']);
    });

    it('drives the brand ramp from the brand family', () => {
      const teal = buildThemeTokens(recipe({ brandFamily: 'teal' }));
      const rose = buildThemeTokens(recipe({ brandFamily: 'rose' }));

      expect(teal.light['--brand-500']).not.toBe(rose.light['--brand-500']);
      // Surfaces and body text stay neutral whatever the brand
      expect(teal.light['--foreground']).toBe(rose.light['--foreground']);
      expect(teal.light['--background']).toBe(rose.light['--background']);
      expect(teal.light['--muted']).toBe(rose.light['--muted']);
    });

    // The brand once reached nothing but `--brand-*` and the link, so picking a
    // colour left buttons, rings and navigation grey
    it('reaches everything that reads as the brand', () => {
      const teal = buildThemeTokens(recipe({ brandFamily: 'teal' }));
      const rose = buildThemeTokens(recipe({ brandFamily: 'rose' }));

      for (const token of [
        '--primary',
        '--ring',
        '--sidebar-primary',
        '--sidebar-ring'
      ]) {
        expect(teal.light[token]).not.toBe(rose.light[token]);
        expect(teal.dark[token]).not.toBe(rose.dark[token]);
      }
    });

    it('gives prose links and core links one colour', () => {
      const built = buildThemeTokens(recipe({ brandFamily: 'teal' }));

      expect(built.light['--links']).toBe('var(--core-link)');
      expect(built.light['--underline']).toBe('var(--core-link)');
    });

    it('points links at the chosen brand step, per scheme', () => {
      const built = buildThemeTokens(
        recipe({ linkShade: { light: '700', dark: '300' } })
      );

      expect(built.light['--core-link']).toBe('var(--brand-700)');
      expect(built.dark['--core-link']).toBe('var(--brand-300)');
    });

    // The three sources exist because every committed theme disagrees with the
    // brand-led defaults, and a recipe with nowhere to say so reopens as a pile
    // of overrides rather than as a theme
    describe('primary source', () => {
      const PRIMARY_GROUP = [
        '--primary',
        '--primary-foreground',
        '--ring',
        '--sidebar-primary',
        '--sidebar-primary-foreground',
        '--sidebar-ring'
      ];

      it('follows the brand family by default', () => {
        const teal = buildThemeTokens(recipe({ brandFamily: 'teal' }));
        const rose = buildThemeTokens(recipe({ brandFamily: 'rose' }));

        // The foregrounds sit on top of the brand rather than carrying it, and
        // stay white whatever it is
        for (const token of [
          '--primary',
          '--ring',
          '--sidebar-primary',
          '--sidebar-ring'
        ]) {
          expect(teal.light[token]).not.toBe(rose.light[token]);
        }
        for (const token of [
          '--primary-foreground',
          '--sidebar-primary-foreground'
        ]) {
          expect(teal.light[token]).toBe(rose.light[token]);
        }
      });

      // The point of the option: on `base` the brand must not reach these at
      // all, or a neutral primary would still shift with the swatch
      it('ignores the brand entirely on base', () => {
        const teal = buildThemeTokens(
          recipe({ brandFamily: 'teal', primarySource: 'base' })
        );
        const rose = buildThemeTokens(
          recipe({ brandFamily: 'rose', primarySource: 'base' })
        );

        for (const token of PRIMARY_GROUP) {
          expect(teal.light[token]).toBe(rose.light[token]);
          expect(teal.dark[token]).toBe(rose.dark[token]);
        }
      });

      it('takes the base family on base', () => {
        const zinc = buildThemeTokens(
          recipe({ baseFamily: 'zinc', primarySource: 'base' })
        );

        expect(zinc.light['--primary']).toBe(shade('zinc', '900'));
        expect(zinc.light['--ring']).toBe(shade('zinc', '400'));
        expect(zinc.dark['--primary']).toBe(shade('zinc', '200'));
      });
    });

    describe('chart source', () => {
      const series = (tokens: ThemeTokens) =>
        [1, 2, 3, 4, 5].map((n) => tokens[`--chart-${n}`]);

      it('follows the brand by default', () => {
        const teal = buildThemeTokens(recipe({ brandFamily: 'teal' }));
        const rose = buildThemeTokens(recipe({ brandFamily: 'rose' }));

        expect(series(teal.light)).not.toEqual(series(rose.light));
      });

      it('keeps shadcn published series whatever the brand', () => {
        const teal = buildThemeTokens(
          recipe({ brandFamily: 'teal', chartSource: 'shadcn' })
        );
        const rose = buildThemeTokens(
          recipe({ brandFamily: 'rose', chartSource: 'shadcn' })
        );

        expect(series(teal.light)).toEqual(series(rose.light));
        expect(series(teal.light)).toEqual(
          SHADCN_CHARTS.light.map((color) => paletteColor(color))
        );
        expect(series(teal.dark)).toEqual(
          SHADCN_CHARTS.dark.map((color) => paletteColor(color))
        );
      });

      // A mono series separates by lightness, so inverting it in dark would
      // collapse the ends against the surface
      it('draws a grey ramp off the base, the same steps in both schemes', () => {
        const built = buildThemeTokens(
          recipe({ baseFamily: 'stone', chartSource: 'base' })
        );

        expect(series(built.light)).toEqual(
          BASE_CHART_SHADES.map((step) => shade('stone', step))
        );
        expect(series(built.dark)).toEqual(series(built.light));
      });
    });

    describe('link source', () => {
      it('takes the chosen brand step by default', () => {
        const built = buildThemeTokens(
          recipe({ linkShade: { light: '700', dark: '300' } })
        );

        expect(built.light['--core-link']).toBe('var(--brand-700)');
        expect(built.dark['--core-link']).toBe('var(--brand-300)');
      });

      // The prose aliases point at `--core-link`, so following the primary has
      // to reach them too rather than leaving links two different colours
      it('follows the primary in both schemes, ignoring the shade', () => {
        const built = buildThemeTokens(
          recipe({
            linkSource: 'primary',
            linkShade: { light: '700', dark: '300' }
          })
        );

        expect(built.light['--core-link']).toBe('var(--primary)');
        expect(built.dark['--core-link']).toBe('var(--primary)');
        expect(built.light['--links']).toBe('var(--core-link)');
        expect(built.light['--underline']).toBe('var(--core-link)');
      });
    });

    // Spotlight layers the content over a tinted body; shadcn and codeware do
    // not, which is why a generated theme looked uniform beside it
    it('separates the content surface only when layered', () => {
      const flat = buildThemeTokens(recipe({ surface: 'flat' }));
      const layered = buildThemeTokens(recipe({ surface: 'layered' }));

      expect(flat.light['--core-background-body']).toBe(
        flat.light['--core-background-content']
      );
      expect(layered.light['--core-background-body']).not.toBe(
        layered.light['--core-background-content']
      );
    });

    // `--core-*` cascades from light, so a light tint would bleed into dark
    it('restates the surface in dark', () => {
      const layered = buildThemeTokens(recipe({ surface: 'layered' }));

      expect(layered.dark['--core-background-body']).toBe('var(--background)');
      expect(layered.dark['--core-background-content']).toBe('var(--card)');
    });

    it('applies the radius', () => {
      expect(buildThemeTokens(recipe({ radius: '0' })).light['--radius']).toBe(
        '0'
      );
    });
  });

  describe('overrides', () => {
    it('win over the generated value', () => {
      const built = buildThemeTokens(recipe(), {
        light: { '--core-link': 'oklch(0.5 0.2 20)' },
        dark: { '--background': '#000' }
      });

      expect(built.light['--core-link']).toBe('oklch(0.5 0.2 20)');
      expect(built.dark['--background']).toBe('#000');
    });

    it('can add a token the template does not carry', () => {
      const built = buildThemeTokens(recipe(), {
        light: { '--custom-thing': 'red' }
      });

      expect(built.light['--custom-thing']).toBe('red');
    });
  });

  // Every theme block is scoped to its own attribute and nothing sits at bare
  // `:root`, so the light map has to stand alone
  it('builds a complete light map and a dark map of only what changes', () => {
    const built = buildThemeTokens(recipe());

    expect(Object.keys(built.light).length).toBeGreaterThan(
      Object.keys(built.dark).length
    );
    expect(built.dark['--body']).toBeUndefined();
    expect(built.light['--body']).toBeDefined();
  });
});
