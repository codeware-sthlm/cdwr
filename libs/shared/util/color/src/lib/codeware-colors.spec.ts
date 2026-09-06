import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { codewareColors } from './codeware-colors';
import { formatOklch, oklchToLinearRgb, parseColor } from './oklch';
import { COLOR_SHADES } from './palette';

/**
 * Colour data with no upstream to diff against, so the guard is structural —
 * the same shape `shadcn-neutrals.spec.ts` uses.
 */
const families = Object.entries(codewareColors);

describe.each(families)('%s', (_family, ramp) => {
  it('defines every step, in order', () => {
    expect(Object.keys(ramp)).toEqual([...COLOR_SHADES]);
  });

  it('is readable by the parser every other check goes through', () => {
    const unparsed = Object.entries(ramp)
      .filter(([, value]) => parseColor(value) === null)
      .map(([step]) => step);

    expect(unparsed).toEqual([]);
  });

  it('darkens with every step', () => {
    const lightness = Object.values(ramp).map((value) => parseColor(value)!.l);

    expect(lightness).toEqual([...lightness].sort((a, b) => b - a));
  });

  // Unclamped: `oklchToRgb` clips into 0–255 by design, so a step outside the
  // gamut comes back looking like a legitimate black or white
  it('stays within the sRGB gamut at every step', () => {
    const outside = Object.entries(ramp)
      .filter(([, value]) => {
        const { r, g, b } = oklchToLinearRgb(parseColor(value)!);
        return [r, g, b].some((channel) => channel < 0 || channel > 1);
      })
      .map(([step]) => step);

    expect(outside).toEqual([]);
  });
});

/**
 * The whole point of naming the family. `brandFromRamp` matches by byte
 * equality of resolved values, not by colour, so a value that merely *renders*
 * the same as the theme file leaves the ramp unnamed and back to eleven
 * overrides.
 */
describe('yale-blue', () => {
  it('matches the ramp payload-admin declares, as text', () => {
    const css = readFileSync(
      new URL(
        '../../../../theme/src/lib/payload-admin/tokens-light.css',
        import.meta.url
      ),
      'utf-8'
    );

    for (const [step, value] of Object.entries(codewareColors['yale-blue'])) {
      expect(css).toContain(`--brand-${step}: ${value};`);
    }
  });
});

describe('space-cadet', () => {
  // The other ten steps are derived, so the one committed colour has to stay
  // exact or the family stops representing it
  it('contains the committed --space-cadet unchanged', () => {
    expect(codewareColors['space-cadet']['800']).toBe(
      formatOklch(parseColor('#1d2951')!)
    );
  });
});
