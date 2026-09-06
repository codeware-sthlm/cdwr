/**
 * The Codeware brand ramps, which no palette ships.
 *
 * Named for the colour and nothing else, the way `mauve` and `olive` are: the
 * palette records where a family came from in its type and its module, never in
 * the string. A `codeware-` or `cdwr-` prefix would put provenance into every
 * token name and into the swatch label an author reads, to say something
 * {@link CodewareFamily} already says precisely.
 *
 * The single-colour Tailwind utilities keep their own `--color-cdwr-*`
 * namespace. Those are the originals; these are ramps built around them.
 *
 * Nothing splits a family from its shade at runtime — every caller
 * *constructs* `family-shade` and looks it up as a key — so a multi-part name
 * is safe here.
 *
 * Without a name in this union `parseTheme` cannot recognise a ramp, falls back
 * to `neutral` and reports every step as an override — which is what made the
 * studio show `payload-admin` a brand swatch that was a lie.
 *
 * Only two of the six Codeware colours are here, and the other four are
 * deliberate omissions:
 *
 * - `--steel-blue` is `yale-blue-400`, not a colour of its own.
 * - `--eerie-black`, `--darker-black` and `--light-gray` are achromatic —
 *   chroma 0.0024, 0 and 0.0026 — and each sits within 1.05:1 of a Tailwind
 *   neutral step. A family for any of them would duplicate `neutral`.
 */
export const codewareColors = {
  /**
   * The admin's brand, hand-cut and committed long before this file.
   *
   * Converted from that hex with `parseColor` → `formatOklch`, which also
   * writes the theme file's ramp: `brandFromRamp` matches a family by byte
   * equality rather than by colour, so the two have to agree as *strings*.
   */
  'yale-blue': {
    '50': 'oklch(0.9666 0.011 243.652)',
    '100': 'oklch(0.9212 0.0252 236.841)',
    '200': 'oklch(0.8464 0.0465 242.325)',
    '300': 'oklch(0.7337 0.0676 244.661)',
    '400': 'oklch(0.6148 0.0764 239.668)',
    '500': 'oklch(0.5142 0.106 248.534)',
    '600': 'oklch(0.4235 0.1287 254.984)',
    '700': 'oklch(0.3687 0.1071 254.562)',
    '800': 'oklch(0.3177 0.0889 254.918)',
    '900': 'oklch(0.2599 0.0741 258.029)',
    '950': 'oklch(0.2104 0.0525 258.271)'
  },
  /**
   * Built on the yale ramp's own curve rather than invented freehand.
   *
   * `--space-cadet` (`#1d2951`) is a single committed colour, so the other ten
   * steps are derived: yale's lightness curve remapped to pass through the seed
   * at the step nearest its lightness (800), yale's chroma curve scaled so that
   * step matches the seed exactly, and the seed's own hue throughout. The
   * result keeps the Codeware ramp's rhythm — including its chroma peak at 600
   * — and contains the committed colour unchanged.
   */
  'space-cadet': {
    '50': 'oklch(0.9666 0.0092 268.906)',
    '100': 'oklch(0.9195 0.0211 268.906)',
    '200': 'oklch(0.8419 0.039 268.906)',
    '300': 'oklch(0.725 0.0566 268.906)',
    '400': 'oklch(0.6016 0.064 268.906)',
    '500': 'oklch(0.4972 0.0888 268.906)',
    '600': 'oklch(0.4031 0.1078 268.906)',
    '700': 'oklch(0.3463 0.0897 268.906)',
    '800': 'oklch(0.2934 0.0745 268.906)',
    '900': 'oklch(0.2487 0.0621 268.906)',
    '950': 'oklch(0.2104 0.044 268.906)'
  }
} as const;

/** The families {@link codewareColors} carries. */
export type CodewareFamily = keyof typeof codewareColors;
