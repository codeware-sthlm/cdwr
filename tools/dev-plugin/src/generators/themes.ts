/**
 * The theme registry the generators share.
 *
 * Two generators read and write the same folders — `theme-sync` regenerates the
 * stylesheets from them, `theme-write` replaces one theme's tokens — so the
 * names and the path live here rather than being restated in each. A theme
 * renamed in one place and not the other is otherwise a silent no-op: the
 * generator simply stops finding the folder it was guarding.
 *
 * Import it with an explicit `.js` extension, pointing at this `.ts` source.
 * `dev-plugin` is `"type": "module"`, and ESM requires the extension — an
 * extensionless relative import is resolved by one loader and required by
 * another, which made Nx die with "Unexpected status of a module that is
 * imported again after being required", naming neither the file nor the
 * import. Every other generator here is a single self-contained file, which is
 * why nothing had hit it before.
 *
 * Deliberately not imported from `@codeware/shared/theme`. The registry there
 * (`site-themes.ts`) is *generated from this one*, so reading it back would be a
 * cycle — and a generator that trusts its own output cannot be the thing that
 * decides what the output should say.
 */

/** Where the committed themes live, relative to the workspace root. */
export const THEME_LIB_PATH = 'libs/shared/theme/src/lib';

/** Contract files every theme is checked against. */
export const CORE_PATH = `${THEME_LIB_PATH}/_core`;

/**
 * The files that hold a theme's tokens.
 *
 * `tailwind-base.css` is deliberately absent: it is a theme's own file, and may
 * carry an `@theme inline` block or a header no generator wrote. Anything
 * writing a theme writes these two and leaves the rest alone.
 */
export const TOKEN_FILES = ['tokens-light.css', 'tokens-dark.css'] as const;

export type TokenFile = (typeof TOKEN_FILES)[number];

/**
 * Themes included in the Storybook switcher.
 * Each must have tokens-light.css, tokens-dark.css and tailwind-base.css.
 */
export const STORYBOOK_THEMES = [
  'shadcn',
  'payload-admin',
  'spotlight',
  'spotlight-fork',
  'codeware'
] as const;

export type SbTheme = (typeof STORYBOOK_THEMES)[number];

/**
 * Themes a tenant site may select, scoped by `data-theme` on `<html>`.
 *
 * `payload-admin` is excluded on purpose: it exists to match Payload's admin
 * chrome, so offering it as a public skin ships a site that looks like a CMS
 * backend. Every entry must also be a Storybook theme — that is what runs the
 * token completeness check.
 */
export const SITE_THEMES = [
  'shadcn',
  'spotlight',
  'spotlight-fork',
  'codeware'
] as const;

export type SiteTheme = (typeof SITE_THEMES)[number];

/** Theme names that would collide with the color scheme in `data-theme`. */
export const RESERVED_THEME_NAMES = ['light', 'dark'];
