/**
 * A tenant-authored theme, as it reaches the stylesheet.
 *
 * Structural rather than the generated Payload type, so this stays a leaf that
 * both the site layout and the studio can use.
 */
export type CustomThemeInput = {
  /** The `data-theme` value */
  slug: string;
  tokensLight: Record<string, unknown>;
  tokensDark: Record<string, unknown>;
};

/** Same shape the built-in themes are generated with: `--core-link`, `--brand-50`. */
const TOKEN_NAME = /^--[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Everything a colour, length or alias needs and nothing more.
 *
 * Covers `oklch(0.7 0.14 182)`, `#fff`, `var(--brand-600)`,
 * `calc(var(--radius) + 4px)` and `color-mix(in oklab, …)`. `+` earns its
 * place: the theme core already uses it and it cannot end a declaration, so
 * rejecting it only dropped valid overrides without saying so. Notably
 * absent: `;` `{` `}` (which would end the declaration or the block early),
 * `<` `>` `&` (which would leave CSS altogether), `@` (`@import`), `!`
 * (`!important`) and `:` (`url(data:…)`). Function calls are checked
 * separately, since excluding `:` alone still lets `url(//host/x)` through.
 */
const TOKEN_VALUE = /^[a-zA-Z0-9\s.,%#()/_+-]+$/;

/**
 * The only functions a token value may call.
 *
 * An allowlist rather than a ban on `url(`: excluding `:` stops
 * `url(https://…)` but not `url(//host/x)`, and protocol-relative fetches are
 * the same problem — as are `image-set()` and `src()`. Naming what may appear
 * ends the game of guessing what may not, which is the rule the rest of this
 * file already follows.
 */
const ALLOWED_FUNCTIONS = new Set([
  'calc',
  'clamp',
  'color',
  'color-mix',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'max',
  'min',
  'oklab',
  'oklch',
  'rgb',
  'rgba',
  'var'
]);

/** Every `name(` in a value, whatever its case. */
const FUNCTION_CALL = /([a-z][a-z0-9-]*)\s*\(/gi;

const callsOnlyAllowedFunctions = (value: string): boolean =>
  [...value.matchAll(FUNCTION_CALL)].every(([, name]) =>
    ALLOWED_FUNCTIONS.has(name.toLowerCase())
  );

/** A theme name goes straight into a selector, so it gets the same treatment. */
const THEME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A theme called `light` or `dark` is indistinguishable from the colour scheme
 * once it is on `data-theme`. `theme-sync` forbids it for the built-ins; the
 * same rule has to hold for authored ones.
 */
const RESERVED_SLUGS = ['light', 'dark'];

/** Long enough for any real value, short enough that nothing can be smuggled. */
const MAX_VALUE_LENGTH = 120;

/** Whether a token name may be written into a theme block. */
export const isValidTokenName = (name: string): boolean =>
  TOKEN_NAME.test(name);

/** Whether a token value may be written into a theme block. */
export const isValidTokenValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_VALUE_LENGTH &&
  TOKEN_VALUE.test(value) &&
  callsOnlyAllowedFunctions(value);

/** Whether a theme name may be used as a `data-theme` value. */
export const isValidThemeSlug = (slug: string): boolean =>
  THEME_SLUG.test(slug) && !RESERVED_SLUGS.includes(slug);

/**
 * Serialise a token map into declarations, dropping whatever fails the
 * whitelist above.
 *
 * Exported so anything else putting these tokens into a stylesheet — the studio
 * scopes them to a preview container rather than an attribute — applies the
 * same rules rather than a second copy of them.
 */
export function themeDeclarations(tokens: Record<string, unknown>): string {
  return Object.entries(tokens)
    .filter(
      ([name, value]) => isValidTokenName(name) && isValidTokenValue(value)
    )
    .map(([name, value]) => `${name}:${value as string}`)
    .join(';');
}

/**
 * Tokens introduced after authored themes were first saved.
 *
 * A stored theme is emitted as saved, so one authored before a token existed
 * leaves it undefined. Each fills in only where the stored map lacks it, with
 * the value the theme template gives new themes.
 */
const BACKFILL_LIGHT: Record<string, string> = {
  // Flat chrome has no ring or shadow; without a track it has no surface
  '--core-action-btn-track': 'var(--muted)'
};

/**
 * Serialise tenant-authored themes into a stylesheet the site layout injects.
 *
 * Token names and values come from the database, so nothing is escaped on the
 * way out — it is whitelisted on the way in, and anything that fails is
 * dropped. Only the braces, colons and semicolons written here are structural.
 * That leaves a string free of `<`, `>` and `&`, which is what makes it safe as
 * a plain text child of `<style>` rather than raw HTML.
 *
 * Dark is scoped `[data-theme='x'].dark`, never `[data-theme=dark]`: once the
 * attribute carries the theme name, the attribute strategy can never match.
 *
 * @param themes - The themes this site offers, in any order.
 * @returns CSS text, or an empty string when there is nothing to inject.
 */
export function customThemeCss(themes: Array<CustomThemeInput>): string {
  return themes
    .filter(({ slug }) => isValidThemeSlug(slug))
    .flatMap(({ slug, tokensLight, tokensDark }) => {
      const stored = themeDeclarations(tokensLight ?? {});
      const dark = themeDeclarations(tokensDark ?? {});

      // A theme with no light tokens has no base to cascade from, so a dark
      // block on its own would leave the light scheme unthemed
      if (!stored) {
        return [];
      }

      const missing = themeDeclarations(
        Object.fromEntries(
          Object.entries(BACKFILL_LIGHT).filter(
            ([name]) => !(name in (tokensLight ?? {}))
          )
        )
      );
      const light = missing ? `${stored};${missing}` : stored;

      const blocks = [`[data-theme='${slug}']{${light}}`];
      if (dark) {
        blocks.push(`[data-theme='${slug}'].dark{${dark}}`);
      }
      return blocks;
    })
    .join('\n');
}
