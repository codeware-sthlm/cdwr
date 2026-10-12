import {
  WCAG_AA_NORMAL,
  contrastRatio,
  oklchToRgb,
  paletteTokens,
  parseColor,
  resolveToken,
  toHex
} from '@codeware/shared/util/color';
import type {
  CustomTheme,
  SiteSetting
} from '@codeware/shared/util/payload-types';

import { type EmailBrand, NEUTRAL_ACCENT } from './templates/layout';

/** The platform's own sender, for mail that belongs to no tenant */
export const PLATFORM_EMAIL_BRAND = {
  name: 'Codeware CMS',
  accent: NEUTRAL_ACCENT
} satisfies EmailBrand;

const WHITE = parseColor('#ffffff');

const palette = paletteTokens();

const isTokenMap = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');

/** The built-in themes' tokens, as `BUILT_IN_TOKENS` in `@codeware/shared/theme` */
export type BuiltInThemes = Record<string, { light: Record<string, string> }>;

/** Light-mode tokens of the default theme, built-in or custom */
function defaultThemeTokens(
  settings: SiteSetting['general'],
  builtIn: BuiltInThemes
): Record<string, string> | null {
  const { customThemes, defaultTheme } = settings;

  const custom = customThemes?.find(
    (theme): theme is CustomTheme =>
      typeof theme === 'object' && theme.slug === defaultTheme
  );
  if (custom) {
    return isTokenMap(custom.tokensLight) ? custom.tokensLight : null;
  }

  return Object.hasOwn(builtIn, defaultTheme)
    ? builtIn[defaultTheme].light
    : null;
}

/** The theme's `--primary` as hex, if it is readable on white */
function themeAccent(
  settings: SiteSetting['general'],
  builtIn: BuiltInThemes
): string | null {
  const tokens = defaultThemeTokens(settings, builtIn);
  const color = tokens
    ? parseColor(resolveToken({ ...palette, ...tokens }, '--primary') ?? '')
    : null;

  if (!color || !WHITE || contrastRatio(color, WHITE) < WCAG_AA_NORMAL) {
    return null;
  }

  return toHex(oklchToRgb(color));
}

/**
 * The sender identity for a tenant's mail, from its site settings.
 *
 * The accent is the default theme's light `--primary`; one that cannot be read,
 * or is too faint to carry white button text, falls back to the neutral colour.
 * The logo is only offered when the site serves one: `/site-icon.png` answers
 * for an SVG mark and 404s otherwise.
 */
export function emailBrandFromSettings(
  settings: Pick<SiteSetting, 'general'>,
  options: {
    /** The tenant's own app; omit where `/site-icon.png` is not the tenant's (the host) */
    serverURL?: string;
    fallbackName: string;
    /** Pass `BUILT_IN_TOKENS`; a util lib cannot import the theme lib itself */
    builtInTokens: BuiltInThemes;
  }
): EmailBrand {
  const { general } = settings;
  const { icon } = general;

  return {
    name: general.appName || options.fallbackName,
    logoUrl:
      options.serverURL && icon?.source === 'svg' && icon.svgCode?.trim()
        ? `${options.serverURL.replace(/\/+$/, '')}/site-icon.png?size=64`
        : undefined,
    accent: themeAccent(general, options.builtInTokens) ?? NEUTRAL_ACCENT
  };
}
