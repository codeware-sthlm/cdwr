import { type PrismTheme, themes } from 'prism-react-renderer';

import { contrastRatio, vsDarkAA, vsLightAA } from './accessible-themes';

const MIN_RATIO = 4.5;

const colorsOf = (theme: PrismTheme) => [
  theme.plain.color,
  ...theme.styles.map((entry) => entry.style.color)
];

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for equal colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('rgb(10, 20, 30)', '#0a141e')).toBeCloseTo(1, 5);
  });

  it('flags the original vsLight attribute colour as failing', () => {
    expect(contrastRatio('rgb(255, 0, 0)', '#ffffff')).toBeLessThan(MIN_RATIO);
  });
});

describe.each([
  ['vsLightAA', vsLightAA, themes.vsLight],
  ['vsDarkAA', vsDarkAA, themes.vsDark]
])('%s', (_name, accessible, original) => {
  const background = accessible.plain.backgroundColor as string;

  it('keeps the background', () => {
    expect(background).toBe(original.plain.backgroundColor);
  });

  it('reaches 4.5:1 for plain and every token colour', () => {
    for (const color of colorsOf(accessible)) {
      expect(color).toBeDefined();
      expect(contrastRatio(color as string, background)).toBeGreaterThanOrEqual(
        MIN_RATIO
      );
    }
  });

  it('only changes colours that fail on the original', () => {
    expect(accessible.styles).toHaveLength(original.styles.length);

    accessible.styles.forEach((entry, i) => {
      const before = original.styles[i];
      expect(entry.types).toEqual(before.types);
      expect(entry.languages).toEqual(before.languages);

      const failed =
        contrastRatio(before.style.color as string, background) < MIN_RATIO;
      if (failed) {
        expect(entry.style.color).not.toBe(before.style.color);
      } else {
        expect(entry.style).toEqual(before.style);
      }
    });
  });
});
