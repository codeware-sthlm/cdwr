/**
 * The typefaces a theme may choose from.
 *
 * A curated set rather than free text, for a reason that is structural rather
 * than editorial: a theme token can only ever *name* a family, and the bytes
 * are declared per app in `_core/fonts.css`. A family nobody has declared
 * renders as its fallback, silently. Offering only what is declared is what
 * keeps the picker honest.
 *
 * Lives beside `palette.ts`, which is the same shape — a registry of families
 * plus the lookups that resolve one.
 */

/** Where a family can be used. A display face has no business as body text. */
export type FontSlot = 'body' | 'heading' | 'mono';

export type FontFamily = {
  /** Stored in the recipe; never shown */
  id: string;
  /** Shown in the picker */
  label: string;
  /**
   * The full CSS stack, unquoted.
   *
   * Unquoted is not a style choice: `customThemeCss` rejects quotes, so this
   * is the only form a runtime theme can carry, and keeping committed themes
   * on the same string means the two cannot drift.
   */
  stack: string;
  /** Which slots the family is offered for */
  slots: ReadonlyArray<FontSlot>;
  /**
   * Filename of the woff2, for a face the platform serves itself.
   *
   * Only set for a family whose bytes are not vendored through npm. The URL is
   * assembled at render time from a configured base, because the store differs
   * per deployment and a build-time literal could not follow it.
   */
  file?: string;
  /**
   * The fontsource stylesheets that declare the face, for one bundled from npm.
   *
   * Imported by `_core/fonts.css`, which a spec holds to this list: a family
   * registered here and never imported renders as its fallback without a word.
   * Bundled faces cost a site only their `@font-face` rules; a browser fetches
   * the files for a family a page actually uses.
   */
  bundled?: ReadonlyArray<string>;
  /**
   * Licensed to Codeware rather than freely redistributable.
   *
   * Only a system user may assign one. The studio hides it, and the collection
   * refuses it — the UI half makes it discoverable, the server half makes it
   * true.
   */
  restricted?: true;
};

const SYSTEM_SANS =
  'ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji';

const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace';

export const FONT_FAMILIES: ReadonlyArray<FontFamily> = [
  {
    id: 'inter',
    label: 'Inter',
    // `Inter Variable` is what `@fontsource-variable/inter` declares; plain
    // `Inter` covers a reader who has it installed, and apps/web, which still
    // loads it from Google
    stack: 'Inter Variable, Inter, sans-serif',
    slots: ['body', 'heading'],
    bundled: ['@fontsource-variable/inter/wght.css']
  },
  {
    id: 'system',
    label: 'System',
    stack: SYSTEM_SANS,
    slots: ['body', 'heading']
  },
  {
    id: 'mono',
    label: 'System mono',
    stack: SYSTEM_MONO,
    slots: ['mono']
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    stack:
      'JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace',
    slots: ['heading'],
    bundled: ['@fontsource-variable/jetbrains-mono/wght.css']
  },
  {
    id: 'space-mono',
    label: 'Space Mono',
    stack: 'Space Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
    slots: ['heading'],
    bundled: [
      '@fontsource/space-mono/400.css',
      '@fontsource/space-mono/700.css'
    ]
  },
  {
    id: 'sora',
    label: 'Sora',
    stack: 'Sora Variable, ui-sans-serif, system-ui, sans-serif',
    slots: ['heading'],
    bundled: ['@fontsource-variable/sora/wght.css']
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    stack: 'Fraunces Variable, ui-serif, Georgia, serif',
    slots: ['heading'],
    bundled: ['@fontsource-variable/fraunces/wght.css']
  },
  {
    id: 'nasalization',
    label: 'Nasalization',
    // Headings only — a display face at body size is unreadable, and the
    // licence is for Codeware's own branding rather than general text
    stack: 'Nasalization, Inter Variable, Inter, sans-serif',
    slots: ['heading'],
    file: 'nasalization-rg-webfont.woff2',
    restricted: true
  }
];

/** What a theme falls back to, and what a new one starts from. */
export const DEFAULT_FONTS: Record<FontSlot, string> = {
  body: 'inter',
  heading: 'inter',
  mono: 'mono'
};

const byId = new Map(FONT_FAMILIES.map((font) => [font.id, font]));

/** Resolve a family by id, or `undefined` for one no longer offered. */
export const fontById = (id: string): FontFamily | undefined => byId.get(id);

/**
 * The families offered for a slot.
 *
 * @param slot - Which slot the picker is filling
 * @param canUseRestricted - Whether the acting user may assign a licensed face
 */
export const fontsForSlot = (
  slot: FontSlot,
  canUseRestricted = false
): ReadonlyArray<FontFamily> =>
  FONT_FAMILIES.filter(
    (font) =>
      font.slots.includes(slot) && (canUseRestricted || !font.restricted)
  );

/**
 * Whether assigning this family needs the system-user gate.
 *
 * An unknown id is not restricted — it is simply unknown, and resolves to the
 * default elsewhere. Reporting it as restricted would blame the wrong thing.
 */
export const isRestrictedFont = (id: string): boolean =>
  fontById(id)?.restricted === true;

/** The stack a slot resolves to, falling back when the id is unknown. */
export const fontStack = (slot: FontSlot, id: string | undefined): string => {
  const font = id ? fontById(id) : undefined;
  const usable = font?.slots.includes(slot) ? font : undefined;

  return (usable ?? fontById(DEFAULT_FONTS[slot]))?.stack ?? SYSTEM_SANS;
};

/**
 * A URL safe to place inside a `url()` in an injected stylesheet.
 *
 * Deliberately stricter than \`new URL()\`: this string is written into a
 * `<style>` block, so anything that could close the declaration, start another
 * rule, or leave CSS altogether has to be impossible rather than unlikely. The
 * value comes from deployment config rather than from a user, which is a reason
 * to keep the check cheap, not a reason to skip it.
 */
const SAFE_ASSET_URL = /^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&*+,;=%-]+$/;

/**
 * An unquoted CSS family name: identifiers separated by spaces.
 *
 * This is the string interpolated into the declaration, so it is the one worth
 * checking — quoting it instead would work, but `customThemeCss` rejects quotes,
 * and keeping the two forms identical is what stops them drifting.
 */
const SAFE_FAMILY = /^[A-Za-z][A-Za-z0-9 -]*$/;

/**
 * Emit the `@font-face` for a family the platform serves itself.
 *
 * Injected per request rather than compiled into the bundle, because the asset
 * store is configured per deployment and because a licensed face may only be
 * declared for a site entitled to it. A face nobody is entitled to is simply
 * never written.
 *
 * @param font - The registry entry, which must carry a `file`
 * @param baseUrl - Where the platform serves its font assets from
 * @returns The face block, or an empty string when it cannot be written safely
 */
export const fontFaceCss = (
  font: FontFamily,
  baseUrl: string | undefined
): string => {
  const base = baseUrl?.replace(/\/+$/, '');

  if (!font.file || !base) {
    return '';
  }

  const url = `${base}/${font.file}`;

  // The family, not the id: the id is never written into the CSS, and checking
  // it would leave the string that *is* interpolated unguarded — a registry
  // entry could carry a safe id and an unsafe stack head.
  const family = font.stack.split(',')[0].trim();

  if (!SAFE_ASSET_URL.test(url) || !SAFE_FAMILY.test(family)) {
    return '';
  }

  return `@font-face{font-family:${family};src:url(${url}) format('woff2');font-display:swap;font-style:normal;font-weight:400}`;
};

/**
 * The self-served faces a set of token maps actually names.
 *
 * Driven by the tokens rather than by the recipe, because the tokens are what
 * renders — a hand-edited `--core-font-heading` names a family just as a
 * chosen one does, and a face that is not written is a family that silently
 * falls back.
 *
 * @param tokenMaps - Every token map that could reach the page
 * @returns The registry entries needing an `@font-face`, deduplicated
 */
export const selfServedFontsIn = (
  tokenMaps: ReadonlyArray<Record<string, unknown>>
): Array<FontFamily> => {
  const named = FONT_FAMILIES.filter((font) => font.file).filter((font) => {
    const family = font.stack.split(',')[0].trim();

    return tokenMaps.some((tokens) =>
      Object.entries(tokens).some(
        ([name, value]) =>
          name.startsWith('--core-font-') &&
          typeof value === 'string' &&
          value
            .split(',')
            .map((part) => part.trim())
            .includes(family)
      )
    );
  });

  return named;
};

/**
 * Narrow a set of families to the ones this deployment may actually embed.
 *
 * The grant is a plain list of font ids, because the *site* it applies to is
 * already settled by where the secret lives: Infisical scopes it to one
 * tenant's deployment, so the value never reaches a site it was not meant for.
 * That makes the tenant half of the check structural rather than a string
 * comparison this code could get wrong.
 *
 * Per font rather than a single flag: each licence covers one typeface on its
 * own terms, and a blanket entitlement would quietly extend to the next
 * licensed face added to the registry.
 *
 * An unrestricted family passes through untouched; only a licensed one needs
 * naming.
 *
 * @param fonts - Families the page would otherwise declare
 * @param granted - Comma-separated font ids this deployment may embed
 * @returns The families this site is entitled to embed
 */
export const entitledFonts = (
  fonts: ReadonlyArray<FontFamily>,
  granted: string | undefined
): Array<FontFamily> => {
  const ids = new Set(
    (granted ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );

  return fonts.filter((font) => !font.restricted || ids.has(font.id));
};
