import type { SiteTheme } from './site-themes';

/**
 * Display names for the built-in themes.
 *
 * Typed against the generated registry, so adding a theme to `SITE_THEMES`
 * fails the build here until it is given a name rather than showing its slug.
 *
 * Proper nouns, so they are not localised.
 *
 * Callers must fall back to the raw value for anything not listed: a theme
 * authored at runtime is not known here.
 */
export const THEME_LABELS: Record<SiteTheme, string> = {
  frost: 'Frost',
  spotlight: 'Spotlight',
  codeware: 'Codeware',
  archipelago: 'Archipelago',
  midsummer: 'Midsummer',
  lingon: 'Lingon',
  granite: 'Granite',
  aurora: 'Aurora',
  cement: 'Cement'
};

/** Display name for a theme, falling back to its own value when unknown. */
export function themeLabel(theme: string): string {
  return THEME_LABELS[theme as SiteTheme] ?? theme;
}
