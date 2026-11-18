import { type PrismTheme, themes } from 'prism-react-renderer';

/**
 * Contrast-safe copies of prism-react-renderer's `vsLight` and `vsDark`.
 *
 * Only token colours below WCAG AA (4.5:1) against the theme's own background
 * are replaced, each moved just enough to pass with its hue kept.
 */

/**
 * Parse `#rgb`, `#rrggbb` or `rgb(r, g, b)` into 0-255 channels.
 */
const parseColor = (color: string): [number, number, number] => {
  const value = color.trim().toLowerCase();

  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16)
    ];
  }

  throw new Error(`Unsupported colour: ${color}`);
};

const luminance = (color: string): number => {
  const [r, g, b] = parseColor(color).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * WCAG contrast ratio between two colours (hex or `rgb()` in).
 */
export const contrastRatio = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/**
 * Replace token colours using a map from the original colour string to the
 * replacement. Everything else is kept as is.
 */
const withColors = (
  theme: PrismTheme,
  replacements: Record<string, string>
): PrismTheme => ({
  ...theme,
  styles: theme.styles.map((entry) => {
    const color = entry.style.color;
    const replacement = color ? replacements[color] : undefined;
    return replacement
      ? { ...entry, style: { ...entry.style, color: replacement } }
      : entry;
  })
});

/**
 * `vsLight` on #ffffff. Replacements are old -> new (ratio old -> new).
 */
export const vsLightAA: PrismTheme = withColors(themes.vsLight, {
  // attr-name, JSX attribute names: #ff0000 -> #ee0000 (4.00 -> 4.53)
  'rgb(255, 0, 0)': 'rgb(238, 0, 0)'
});

/**
 * `vsDark` on #1e1e1e. Replacements are old -> new (ratio old -> new).
 */
export const vsDarkAA: PrismTheme = withColors(themes.vsDark, {
  // prolog: #000080 -> #7878ff (1.04 -> 4.70). Navy cannot reach 4.5:1 on a
  // dark surface, so this is the nearest blue that can
  'rgb(0, 0, 128)': 'rgb(120, 120, 255)',
  // constant: #646695 -> #7f82bc (3.08 -> 4.6)
  'rgb(100, 102, 149)': 'rgb(127, 130, 188)',
  // punctuation in markup: #808080 -> #868686 (4.22 -> 4.57)
  '#808080': '#868686'
});
