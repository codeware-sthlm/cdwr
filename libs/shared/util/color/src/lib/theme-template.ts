import type { TailwindColor } from '@codeware/shared/util/tailwind';

import { DEFAULT_FONTS, fontStack } from './fonts';
import type { ColorShade } from './palette';

/**
 * Where a generated token gets its value.
 *
 * `base` names a step of the theme's neutral family and `brand` a step of its
 * brand family; `palette` is a fixed colour anywhere in the Tailwind palette.
 * All three resolve to literals. `value` is written out verbatim, which covers
 * keywords and `var()` references to tokens declared in the same block.
 *
 * Nothing here holds a raw `oklch(…)` string. Every colour in the committed
 * themes turned out to be a palette entry, so naming it keeps the table
 * readable and makes a mistyped digit impossible.
 */
export type TokenSource =
  | { base: ColorShade }
  | { brand: ColorShade }
  | { palette: TailwindColor }
  | { value: string };

/**
 * Whether the primary and the controls that follow it take a brand step or a
 * neutral one.
 *
 * `base` is what every committed theme does — shadcn's own default primary is
 * a near-black neutral, and `codeware` and `payload-admin` inherited it. On
 * `brand` the primary carries the brand colour, which is what a theme picked
 * from a colour swatch is expected to do.
 */
export type PrimarySource = 'brand' | 'base';

/**
 * Where the five chart colours come from.
 *
 * `brand` spaces them around the wheel from the brand; `shadcn` is the fixed
 * series shadcn publishes, which `codeware`, `spotlight` and `payload-admin`
 * all still carry; `base` is the grey ramp the `shadcn` theme itself draws.
 */
export type ChartSource = 'brand' | 'shadcn' | 'base';

/** Whether links take their own brand step or simply follow the primary. */
export type LinkSource = 'brand' | 'primary';

/**
 * The shadcn layer, light.
 *
 * Every neutral is a step of the chosen family — the mapping was read off the
 * committed `shadcn` and `codeware` themes, which agree on it exactly. That is
 * what makes any Tailwind family usable as a base, rather than only the five
 * shadcn publishes.
 */
export const BASE_LIGHT: Record<string, TokenSource> = {
  '--background': { palette: 'white' },
  '--foreground': { base: '950' },
  '--card': { palette: 'white' },
  '--card-foreground': { base: '950' },
  '--popover': { palette: 'white' },
  '--popover-foreground': { base: '950' },
  '--secondary': { base: '100' },
  '--secondary-foreground': { base: '900' },
  '--muted': { base: '100' },
  // 600, not shadcn's 500: on `--muted` that only reaches 4.34:1, just under AA
  '--muted-foreground': { base: '600' },
  '--accent': { base: '100' },
  '--accent-foreground': { base: '900' },
  '--destructive': { palette: 'red-600' },
  '--destructive-foreground': { palette: 'white' },
  '--border': { base: '200' },
  '--input': { base: '200' },
  '--sidebar': { base: '50' },
  '--sidebar-foreground': { base: '950' },
  '--sidebar-accent': { base: '100' },
  '--sidebar-accent-foreground': { base: '900' },
  '--sidebar-border': { base: '200' }
};

/**
 * The shadcn layer, dark.
 *
 * `--border` and `--input` are translucent white rather than a palette step —
 * a hairline that reads at any surface depth, which a fixed shade does not.
 */
export const BASE_DARK: Record<string, TokenSource> = {
  '--background': { base: '950' },
  '--foreground': { base: '50' },
  '--card': { base: '900' },
  '--card-foreground': { base: '50' },
  '--popover': { base: '900' },
  '--popover-foreground': { base: '50' },
  '--secondary': { base: '800' },
  '--secondary-foreground': { base: '50' },
  '--muted': { base: '800' },
  '--muted-foreground': { base: '400' },
  '--accent': { base: '800' },
  '--accent-foreground': { base: '50' },
  '--destructive': { palette: 'red-700' },
  '--destructive-foreground': { palette: 'white' },
  '--border': { value: 'oklch(1 0 0 / 10%)' },
  '--input': { value: 'oklch(1 0 0 / 15%)' },
  '--sidebar': { base: '900' },
  '--sidebar-foreground': { base: '50' },
  '--sidebar-accent': { base: '800' },
  '--sidebar-accent-foreground': { base: '50' },
  '--sidebar-border': { value: 'oklch(1 0 0 / 10%)' }
};

/**
 * The primary and everything that follows it, light.
 *
 * Split out of {@link BASE_LIGHT} because it is the one group the committed
 * themes disagree with: they run a neutral primary and a neutral ring, while a
 * theme picked from a brand swatch expects that swatch on its buttons.
 *
 * On `brand`, 700 rather than 600: white text clears 4.5:1 on every family at
 * 700 but fails on nine of them at 600 — yellow, lime and amber worst. The ring
 * follows the primary, so a focused control is recognisably the brand.
 */
export const PRIMARY_LIGHT: Record<
  PrimarySource,
  Record<string, TokenSource>
> = {
  brand: {
    '--primary': { brand: '700' },
    '--primary-foreground': { palette: 'white' },
    '--ring': { brand: '700' },
    '--sidebar-primary': { brand: '700' },
    '--sidebar-primary-foreground': { palette: 'white' },
    '--sidebar-ring': { brand: '700' }
  },
  base: {
    '--primary': { base: '900' },
    '--primary-foreground': { base: '50' },
    // A step light enough to read as a focus ring against the surfaces, which
    // the near-black primary does not
    '--ring': { base: '400' },
    '--sidebar-primary': { base: '900' },
    '--sidebar-primary-foreground': { base: '50' },
    '--sidebar-ring': { base: '400' }
  }
};

/**
 * The primary group, dark — the light pair inverted.
 *
 * 400 over 950 clears 4.5:1 on every family.
 */
export const PRIMARY_DARK: Record<
  PrimarySource,
  Record<string, TokenSource>
> = {
  brand: {
    '--primary': { brand: '400' },
    '--primary-foreground': { brand: '950' },
    '--ring': { brand: '400' },
    '--sidebar-primary': { brand: '400' },
    '--sidebar-primary-foreground': { brand: '950' },
    '--sidebar-ring': { brand: '400' }
  },
  base: {
    '--primary': { base: '200' },
    '--primary-foreground': { base: '900' },
    '--ring': { base: '500' },
    '--sidebar-primary': { base: '200' },
    '--sidebar-primary-foreground': { base: '900' },
    '--sidebar-ring': { base: '500' }
  }
};

/**
 * The five chart colours shadcn publishes, which three of the four committed
 * themes still carry unchanged.
 *
 * Named rather than written as the `oklch(…)` triples the themes hold: each one
 * resolves to a palette entry, and the steps are deliberately uneven — the
 * series was picked to separate on screen, not to sit on one row of the ramp.
 */
export const SHADCN_CHARTS: Record<'light' | 'dark', Array<TailwindColor>> = {
  light: ['orange-600', 'teal-600', 'cyan-900', 'amber-400', 'amber-500'],
  dark: ['blue-700', 'emerald-500', 'amber-500', 'purple-500', 'rose-500']
};

/**
 * The grey ramp the `shadcn` theme itself draws, as steps of the base family.
 *
 * The same steps in both schemes — a mono series separates by lightness, and
 * inverting it would collapse the ends against the surface it sits on.
 */
export const BASE_CHART_SHADES: Array<ColorShade> = [
  '300',
  '500',
  '600',
  '700',
  '800'
];

/**
 * The core and prose layers, light.
 *
 * Taken from the committed themes, where 39 of these 41 tokens are
 * byte-identical between `shadcn` and `codeware` — they are plumbing from the
 * renderer's vocabulary onto the shadcn one, not a design surface. The two that
 * do vary, `--core-link` and `--core-surface-invert`, come from the recipe and
 * are added by the builder.
 */
export const ALIAS_LIGHT: Record<string, TokenSource> = {
  // Not in the recipe: the registry offers one mono face, so there is no
  // decision to store. It becomes a recipe field when a second one arrives.
  '--core-font-mono': { value: fontStack('mono', DEFAULT_FONTS.mono) },
  '--core-action-btn-foreground': { value: 'var(--muted-foreground)' },
  '--core-action-btn-foreground-hover': { value: 'var(--foreground)' },
  '--core-action-btn-background': { value: 'var(--background)' },
  '--core-action-btn-border': { value: 'var(--border)' },
  '--core-action-btn-border-hover': { value: 'var(--border)' },
  '--core-action-btn-icon-fill': { value: 'var(--muted)' },
  '--core-action-btn-shadow': { value: 'transparent' },
  '--core-header': { value: 'var(--foreground)' },
  '--core-headline': { value: 'var(--foreground)' },
  // The hover affordance on an interactive surface — a card border, a pill.
  // Its own token rather than `--core-link` because that one is read as text
  // and has to clear 4.5:1; a border does not, and wants the softer step.
  // Light-only: the brand ramp is defined once and dark inherits it.
  '--core-interactive': { value: 'var(--brand-400)' },
  '--core-navbar': { value: 'var(--background)' },
  '--core-navbar-border': { value: 'var(--border)' },
  '--core-navbar-shadow': { value: 'transparent' },
  '--core-nav-link': { value: 'var(--foreground)' },
  '--core-nav-link-active': { value: 'var(--primary)' },
  '--core-nav-link-hover': { value: 'var(--primary)' },
  '--core-text': { value: 'var(--foreground)' },
  '--body': { value: 'var(--foreground)' },
  '--bold': { value: 'var(--foreground)' },
  '--bullets': { value: 'var(--primary)' },
  '--captions': { value: 'var(--muted-foreground)' },
  '--code': { value: 'var(--foreground)' },
  '--code-bg': { value: 'var(--muted)' },
  '--counters': { value: 'var(--primary)' },
  '--headings': { value: 'var(--foreground)' },
  '--hr': { value: 'var(--border)' },
  // Prose links and `--core-link` are the same thing to a reader; the committed
  // themes point these at `--primary`, which only agrees while the primary is
  // itself the link colour
  '--links': { value: 'var(--core-link)' },
  '--links-hover': { value: 'var(--core-link)' },
  '--pre-bg': { value: 'var(--secondary)' },
  '--pre-border': { value: 'var(--border)' },
  '--pre-code': { value: 'var(--foreground)' },
  '--quote-borders': { value: 'var(--border)' },
  '--td-borders': { value: 'var(--border)' },
  '--th-borders': { value: 'var(--border)' },
  '--underline': { value: 'var(--core-link)' },
  '--underline-hover': { value: 'var(--core-link)' }
};

/**
 * How the page separates its content column from the shell around it.
 *
 * `flat` paints body, content and footer the same — what `shadcn` and
 * `codeware` do. `layered` sits the content on a lighter card over a tinted
 * body, so the margins and footer read as a frame; that is `spotlight`'s look
 * and the reason it feels less uniform than the others.
 */
export const SURFACE_LIGHT: Record<
  'flat' | 'layered',
  Record<string, TokenSource>
> = {
  flat: {
    '--core-background-body': { value: 'var(--background)' },
    '--core-background-content': { value: 'var(--background)' },
    '--core-content-border': { value: 'var(--border)' }
  },
  layered: {
    '--core-background-body': { base: '50' },
    '--core-background-content': { value: 'var(--background)' },
    '--core-content-border': { base: '100' }
  }
};

/**
 * Dark has to restate these: the light block sets them to a light colour, and
 * `--core-*` cascades rather than being re-derived per scheme.
 */
export const SURFACE_DARK: Record<
  'flat' | 'layered',
  Record<string, TokenSource>
> = {
  flat: {
    '--core-background-body': { value: 'var(--background)' },
    '--core-background-content': { value: 'var(--background)' },
    '--core-content-border': { value: 'var(--border)' }
  },
  layered: {
    // The raised surface in dark is the card, the same relationship inverted
    '--core-background-body': { value: 'var(--background)' },
    '--core-background-content': { value: 'var(--card)' },
    '--core-content-border': { value: 'var(--border)' }
  }
};

/**
 * Text on tinted surfaces — badge, alert and button soft variants.
 *
 * Outside the generator's contract but used by the shadcn components, so a
 * theme without them loses colour on those variants.
 */
export const SUBTLE_LIGHT: Record<string, TokenSource> = {
  '--destructive-subtle': { palette: 'red-700' },
  '--success-subtle': { palette: 'green-700' },
  '--warning-subtle': { palette: 'amber-700' }
};

export const SUBTLE_DARK: Record<string, TokenSource> = {
  '--destructive-subtle': { palette: 'red-400' },
  '--success-subtle': { palette: 'green-400' },
  '--warning-subtle': { palette: 'amber-400' }
};
