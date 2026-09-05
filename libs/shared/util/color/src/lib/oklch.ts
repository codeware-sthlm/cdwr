/**
 * A colour in the form every generated token uses.
 *
 * `l` is 0–1, `c` is the chroma, `h` degrees, `alpha` 0–1.
 */
export type Oklch = {
  l: number;
  c: number;
  h: number;
  alpha: number;
};

/** Linear-light sRGB, before the transfer function. Components may fall outside 0–1. */
export type LinearRgb = {
  r: number;
  g: number;
  b: number;
};

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Read `oklch(L C H)`, `oklch(L C H / A)`, `#rgb` or `#rrggbb`.
 *
 * Both notations appear in the committed themes, and a generated theme is
 * checked against the same rules whichever it came from. Anything else — a
 * `var()` alias, a `calc()`, a named colour — has no numeric value to check and
 * returns `null` rather than a guess.
 */
export function parseColor(value: string): Oklch | null {
  const input = value.trim();

  const hex = HEX_6.exec(input) ?? HEX_3.exec(input);
  if (hex) {
    const [r, g, b] = hex.slice(1, 4).map((part) => {
      const full = part.length === 1 ? part + part : part;
      return parseInt(full, 16) / 255;
    });
    return linearRgbToOklch({
      r: srgbToLinear(r),
      g: srgbToLinear(g),
      b: srgbToLinear(b)
    });
  }

  const oklch = /^oklch\(\s*([^)]+)\)$/i.exec(input);
  if (!oklch) {
    return null;
  }

  const [coords, alphaPart] = oklch[1].split('/');
  const parts = coords.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }

  // `l` accepts both `0.7` and `70%`; the palette uses both
  const l = asNumber(parts[0], true);
  const c = asNumber(parts[1], false);
  const h = asNumber(parts[2], false);
  const alpha = alphaPart === undefined ? 1 : asNumber(alphaPart.trim(), true);

  if ([l, c, h, alpha].some(Number.isNaN)) {
    return null;
  }
  return { l, c, h, alpha };
}

function asNumber(token: string, percentIsFraction: boolean): number {
  if (token.endsWith('%')) {
    const value = Number.parseFloat(token.slice(0, -1));
    return percentIsFraction ? value / 100 : value;
  }
  return Number.parseFloat(token);
}

/** sRGB transfer function, channel value 0–1. */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Oklch → linear sRGB, via Oklab and the LMS cone responses.
 *
 * Matrices from Björn Ottosson's Oklab definition.
 */
export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    g: -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    b: -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone
  };
}

/** Linear sRGB → Oklch, the inverse of {@link oklchToLinearRgb}. */
function linearRgbToOklch({ r, g, b }: LinearRgb): Oklch {
  const lCone = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  );
  const mCone = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  );
  const sCone = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  );

  const l = 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone;
  const a = 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone;
  const bAxis =
    0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone;

  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;

  return {
    l,
    c: Math.hypot(a, bAxis),
    h: hue < 0 ? hue + 360 : hue,
    alpha: 1
  };
}

/**
 * WCAG relative luminance.
 *
 * Clamps to the sRGB gamut first: a wide-gamut oklch value has no luminance
 * on a screen that cannot show it, and the clamped colour is what a visitor
 * actually sees.
 */
export function relativeLuminance(color: Oklch): number {
  const { r, g, b } = oklchToLinearRgb(color);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

/**
 * WCAG contrast ratio between two colours, 1–21.
 *
 * A translucent foreground is composited over the background first — checking
 * it at full strength would report a contrast no visitor sees. A translucent
 * *background* has no defined backdrop here, so it is taken at face value.
 */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const backgroundLuminance = relativeLuminance(background);
  const foregroundLuminance =
    foreground.alpha >= 1
      ? relativeLuminance(foreground)
      : relativeLuminance(foreground) * foreground.alpha +
        backgroundLuminance * (1 - foreground.alpha);

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/** sRGB with 0–255 channels and 0–1 alpha, the shape a colour picker speaks. */
export type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

/** Inverse of {@link srgbToLinear}, channel value 0–1. */
function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/**
 * Oklch → sRGB, for handing a token value to a picker.
 *
 * Clamped to the gamut, so a wide-gamut palette entry comes back as the colour
 * a screen can actually show. That makes the round trip lossy: a caller must
 * write back only what the author picked, never what seeding returned.
 */
export function oklchToRgb(color: Oklch): Rgba {
  const linear = oklchToLinearRgb(color);
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(value))) * 255);

  return {
    r: channel(linear.r),
    g: channel(linear.g),
    b: channel(linear.b),
    a: color.alpha
  };
}

/** sRGB → Oklch, the inverse of {@link oklchToRgb}. */
export function rgbToOklch({ r, g, b, a }: Rgba): Oklch {
  return {
    ...linearRgbToOklch({
      r: srgbToLinear(r / 255),
      g: srgbToLinear(g / 255),
      b: srgbToLinear(b / 255)
    }),
    alpha: a
  };
}

/** Trailing zeros read as false precision on a value nobody typed. */
const round = (value: number, decimals: number): string =>
  String(Number(value.toFixed(decimals)));

/**
 * Write a colour the way the palette writes one.
 *
 * The alpha part is left off at full opacity — every opaque token in the
 * committed themes is three components, and adding `/ 100%` to all of them
 * would make a picked value look unlike its neighbours.
 */
export function formatOklch({ l, c, h, alpha }: Oklch): string {
  const coords = `${round(l, 4)} ${round(c, 4)} ${round(h, 3)}`;
  return alpha >= 1
    ? `oklch(${coords})`
    : `oklch(${coords} / ${round(alpha * 100, 2)}%)`;
}
