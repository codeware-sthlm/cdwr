import { type TailwindColor, tailwind } from '@codeware/shared/util/tailwind';

import { type CodewareFamily, codewareColors } from './codeware-colors';
import { type ShadcnNeutralFamily, shadcnNeutrals } from './shadcn-neutrals';

type FamilyOf<T> = T extends `${infer Family}-${string}` ? Family : never;

/**
 * A family Tailwind itself ships.
 *
 * Derived from the palette rather than listed, so a family added upstream
 * becomes available here without an edit — and one removed stops compiling.
 * `white` and `black` have no ramp and are excluded by construction.
 *
 * Kept apart from {@link ColorFamily} because anything filtering
 * `tailwind.names` can only ever narrow to this half.
 */
export type TailwindFamily = FamilyOf<TailwindColor>;

/** A colour family carrying a 50–950 ramp, from any source. */
export type ColorFamily = TailwindFamily | ShadcnNeutralFamily | CodewareFamily;

/** The steps every family defines. */
export const COLOR_SHADES = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950'
] as const;

export type ColorShade = (typeof COLOR_SHADES)[number];

/**
 * The families that work as a theme's base.
 *
 * Any family is accepted — the type is open — but a chromatic one tints every
 * surface and border, and several of the contrast pairs stop passing. These are
 * the nine shadcn offers: Tailwind's five neutrals, then its own tinted four.
 */
export const NEUTRAL_FAMILIES = [
  'neutral',
  'zinc',
  'slate',
  'gray',
  'stone',
  'mauve',
  'olive',
  'mist',
  'taupe'
] as const satisfies ReadonlyArray<ColorFamily>;

/**
 * Every family carrying a ramp, from both sources.
 *
 * Derived, because a hand-kept copy of this is what lets a family be offered in
 * one place and rejected in another.
 */
export const COLOR_FAMILIES: ReadonlyArray<ColorFamily> = [
  ...tailwind.names.filter(
    (name): name is TailwindFamily => name !== 'white' && name !== 'black'
  ),
  ...(Object.keys(shadcnNeutrals) as Array<ShadcnNeutralFamily>),
  ...(Object.keys(codewareColors) as Array<CodewareFamily>)
];

const colorFamilies: ReadonlySet<string> = new Set(COLOR_FAMILIES);

/** Whether a stored value names a family any source ships. */
export const isColorFamily = (value: unknown): value is ColorFamily =>
  typeof value === 'string' && colorFamilies.has(value);

/** Any colour any source can name, `white` and `black` included. */
export type PaletteColor =
  | TailwindColor
  | `${ShadcnNeutralFamily}-${ColorShade}`
  | `${CodewareFamily}-${ColorShade}`;

/** Every step of every family Tailwind does not ship, flattened to one lookup. */
const localColors: Record<string, string> = Object.fromEntries(
  [
    ...Object.entries(shadcnNeutrals),
    ...Object.entries(codewareColors)
  ].flatMap(([family, ramp]) =>
    Object.entries(ramp).map(([step, value]) => [`${family}-${step}`, value])
  )
);

/** Own properties only: `'toString' in obj` is true, and it is not a colour. */
const localColor = (name: string): string | undefined =>
  Object.hasOwn(localColors, name) ? localColors[name] : undefined;

/**
 * Resolve a palette entry from whichever source owns its family.
 *
 * The one place that knows there is more than one, so nothing downstream asks.
 */
export const paletteColor = (name: PaletteColor): string =>
  localColor(name) ?? tailwind.color(name as TailwindColor);

/**
 * How a palette entry is written into a compiled theme file.
 *
 * `var(--color-…)` is what a reviewer wants to read, because it says which step
 * was chosen where a literal only says which colour came out. Tailwind declares
 * those variables for its own families only, so an alias to a family we ship
 * ourselves would resolve to nothing — those fall back to the literal.
 */
export const paletteAlias = (name: PaletteColor): string =>
  localColor(name) ?? `var(--color-${name})`;

/**
 * Resolve one palette step to its literal value.
 *
 * Always a literal, never `var(--color-…)`: Tailwind emits only the shades
 * referenced at build time, so an injected theme aliasing a shade nothing else
 * uses would resolve to nothing at all.
 */
export const shade = (family: ColorFamily, step: ColorShade): string =>
  paletteColor(`${family}-${step}` as PaletteColor);

/**
 * The `--brand-50` … `--brand-950` ramp for a family.
 *
 * The rest of the theme reaches the brand through these rather than the palette
 * directly, so a single recipe change re-colours every reference.
 */
export const brandRamp = (
  family: ColorFamily,
  format: 'literal' | 'alias' = 'literal'
): Record<string, string> =>
  Object.fromEntries(
    COLOR_SHADES.map((step) => [
      `--brand-${step}`,
      format === 'alias'
        ? paletteAlias(`${family}-${step}` as PaletteColor)
        : shade(family, step)
    ])
  );
