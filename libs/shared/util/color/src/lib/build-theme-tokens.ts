import { chartFamilies } from './chart-ramp';
import { DEFAULT_FONTS, fontStack } from './fonts';
import { normaliseRecipe } from './normalise-recipe';
import {
  type ColorFamily,
  type ColorShade,
  type PaletteColor,
  brandRamp,
  paletteAlias,
  paletteColor
} from './palette';
import {
  ALIAS_LIGHT,
  BAND_GRADIENT,
  BASE_CHART_SHADES,
  BASE_DARK,
  BASE_LIGHT,
  type ChartSource,
  type LinkSource,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  type PrimarySource,
  SHADCN_CHARTS,
  SUBTLE_DARK,
  SUBTLE_LIGHT,
  SURFACE_DARK,
  SURFACE_LIGHT,
  type TokenSource
} from './theme-template';

/** A resolved token map, ready to be written into a theme block. */
export type ThemeTokens = Record<string, string>;

/**
 * How a palette colour is written out.
 *
 * `literal` for a runtime theme: Tailwind emits only the palette shades some
 * source file references, so an injected `var(--color-violet-600)` would
 * resolve to nothing. `alias` for a committed theme file, which is compiled —
 * there the alias is what a reviewer wants to read.
 */
export type ValueFormat = 'literal' | 'alias';

/**
 * What a whole theme is decided by.
 *
 * Four choices, because the 38-token core and prose layer is fixed and the
 * shadcn layer is a set of steps off one family. Anything the recipe cannot
 * express is a per-token override on top, not another field here.
 */
export type ThemeRecipe = {
  /** Drives every neutral: surfaces, text, borders, rings */
  baseFamily: ColorFamily;
  /**
   * Drives the `--brand-*` ramp and everything that reads as the brand:
   * primary buttons, focus rings, links, active navigation.
   */
  brandFamily: ColorFamily;
  /**
   * Whether the content column sits on its own surface (`layered`) or shares
   * one with the page shell and footer (`flat`).
   */
  surface: 'flat' | 'layered';
  /** The `--radius` root value, e.g. `0.625rem` */
  radius: string;
  /** Which brand step links take, per scheme — dark needs a lighter one to read */
  linkShade: { light: ColorShade; dark: ColorShade };
  /**
   * Whether the primary, the ring and their sidebar twins read as the brand or
   * as a neutral.
   *
   * A decision rather than a quirk: all four committed themes run a neutral
   * primary, and a theme cannot be reopened from its CSS without somewhere to
   * put that.
   */
  primarySource: PrimarySource;
  /** Where the chart series comes from */
  chartSource: ChartSource;
  /** Whether links take their own brand step, or follow the primary */
  linkSource: LinkSource;
  /**
   * Registry ids, not stacks.
   *
   * A stack would let a theme name a family nothing declares, which renders as
   * the fallback with nothing to say why — and would put a licensed face out of
   * reach of the gate that gets to refuse it.
   */
  fontBody: string;
  fontHeading: string;
};

/**
 * A neutral starting point, close to the built-in `shadcn` theme.
 *
 * `light: '700'` because that is the only brand step whose link clears 4.5:1 on
 * white for every family — 600 fails on nine of them.
 */
export const DEFAULT_RECIPE: ThemeRecipe = {
  baseFamily: 'neutral',
  brandFamily: 'neutral',
  surface: 'layered',
  radius: '0.625rem',
  linkShade: { light: '700', dark: '400' },
  fontBody: DEFAULT_FONTS.body,
  fontHeading: DEFAULT_FONTS.heading,
  // The brand reaching the primary, the charts and the links is what makes
  // picking a swatch visibly do something. The committed themes chose
  // otherwise, and can say so; a new theme should not start there.
  primarySource: 'brand',
  chartSource: 'brand',
  linkSource: 'brand'
};

const paletteValue = (name: PaletteColor, format: ValueFormat): string =>
  format === 'alias' ? paletteAlias(name) : paletteColor(name);

const resolve = (
  source: TokenSource,
  { baseFamily, brandFamily }: ThemeRecipe,
  format: ValueFormat
): string => {
  if ('base' in source) {
    return paletteValue(`${baseFamily}-${source.base}` as PaletteColor, format);
  }
  if ('brand' in source) {
    return paletteValue(
      `${brandFamily}-${source.brand}` as PaletteColor,
      format
    );
  }
  if ('palette' in source) {
    return paletteValue(source.palette as PaletteColor, format);
  }
  return source.value;
};

const resolveAll = (
  sources: Record<string, TokenSource>,
  recipe: ThemeRecipe,
  format: ValueFormat
): ThemeTokens =>
  Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      resolve(source, recipe, format)
    ])
  );

/**
 * Build a complete theme from a recipe.
 *
 * Complete, not a diff: every theme block is scoped to its own `[data-theme]`
 * and nothing sits at bare `:root`, so a partial token map leaves the page
 * with no base to inherit from.
 *
 * The light map carries everything; the dark map carries only what changes,
 * which the `.dark` block layers on top. That mirrors how the committed themes
 * are written, and how the generator's contract is defined.
 *
 * @param recipe - The four decisions
 * @param overrides - Per-token values applied last, for what a recipe cannot say
 * @returns Token maps for both schemes
 */
export function buildThemeTokens(
  storedRecipe: ThemeRecipe,
  overrides: { light?: ThemeTokens; dark?: ThemeTokens } = {},
  format: ValueFormat = 'literal'
): { light: ThemeTokens; dark: ThemeTokens } {
  // The type is a claim about where a recipe was authored, not about a value
  // read back from a JSON column — one saved before a field existed is short
  // of it, and every lookup below would then miss
  const recipe = normaliseRecipe(storedRecipe);
  const { baseFamily, brandFamily, radius, linkShade } = recipe;

  // Charts follow the brand by default, so a themed site does not draw its data
  // in someone else's colours — but a theme may keep shadcn's published series
  // or a grey ramp, which is what the committed ones do
  const charts = chartFamilies(brandFamily);
  const chartTokens = (scheme: 'light' | 'dark'): ThemeTokens => {
    const colors: Array<PaletteColor> =
      recipe.chartSource === 'shadcn'
        ? SHADCN_CHARTS[scheme]
        : recipe.chartSource === 'base'
          ? BASE_CHART_SHADES.map(
              (step) => `${baseFamily}-${step}` as PaletteColor
            )
          : charts.map(
              (family) =>
                `${family}-${scheme === 'light' ? '600' : '400'}` as PaletteColor
            );

    return Object.fromEntries(
      colors.map((color, index) => [
        `--chart-${index + 1}`,
        paletteValue(color, format)
      ])
    );
  };

  /** A link takes its own brand step, or simply follows the primary. */
  const linkValue = (scheme: 'light' | 'dark'): string =>
    recipe.linkSource === 'primary'
      ? 'var(--primary)'
      : `var(--brand-${linkShade[scheme]})`;

  const light: ThemeTokens = {
    ...brandRamp(brandFamily, format),
    '--radius': radius,
    '--radius-md': 'calc(var(--radius) - 0.125rem)',
    ...resolveAll(BASE_LIGHT, recipe, format),
    ...resolveAll(PRIMARY_LIGHT[recipe.primarySource], recipe, format),
    ...chartTokens('light'),
    ...resolveAll(SUBTLE_LIGHT, recipe, format),
    ...resolveAll(ALIAS_LIGHT, recipe, format),
    ...resolveAll(SURFACE_LIGHT[recipe.surface], recipe, format),
    ...resolveAll(BAND_GRADIENT, recipe, format),
    // Resolved from the registry rather than stored as a stack, so a family the
    // registry drops reads as the default instead of as an unheard-of name
    '--core-font-body': fontStack('body', recipe.fontBody),
    '--core-font-heading': fontStack('heading', recipe.fontHeading),
    // Through the ramp rather than the palette, so re-branding is one change
    '--core-link': linkValue('light'),
    '--core-surface-invert': paletteValue(
      `${baseFamily}-900` as PaletteColor,
      format
    ),
    ...overrides.light
  };

  const dark: ThemeTokens = {
    ...resolveAll(BASE_DARK, recipe, format),
    ...resolveAll(PRIMARY_DARK[recipe.primarySource], recipe, format),
    // Lighter, so a series reads against a dark surface
    ...chartTokens('dark'),
    ...resolveAll(SUBTLE_DARK, recipe, format),
    ...resolveAll(SURFACE_DARK[recipe.surface], recipe, format),
    '--core-link': linkValue('dark'),
    // The inverted surface is the raised one once the page is already dark
    '--core-surface-invert': 'var(--card)',
    ...overrides.dark
  };

  return { light, dark };
}
