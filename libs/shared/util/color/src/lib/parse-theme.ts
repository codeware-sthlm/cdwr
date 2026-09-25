import {
  DEFAULT_RECIPE,
  type ThemeRecipe,
  type ThemeTokens,
  buildThemeTokens
} from './build-theme-tokens';
import { FONT_FAMILIES, type FontSlot, fontStack } from './fonts';
import { parseColor } from './oklch';
import {
  COLOR_FAMILIES,
  COLOR_SHADES,
  type ColorFamily,
  type ColorShade,
  type PaletteColor,
  paletteColor
} from './palette';
import type { ThemeFiles } from './theme-export';

/** A token the parser could not express, kept so a caller can say so. */
export type UnresolvedToken = {
  scheme: 'light' | 'dark';
  token: string;
  value: string;
  reason: 'build-time-call' | 'unknown-reference';
};

export type ParsedTheme = {
  /** The decisions the token map is best explained by */
  recipe: ThemeRecipe;
  /** What the recipe cannot account for, applied on top of it */
  overrides: { light: ThemeTokens; dark: ThemeTokens };
  /**
   * Declarations the template never generates, kept verbatim.
   *
   * `codeware` declares six brand hexes its `tailwind-base.css` then maps
   * through `@theme inline`; dropping them would break the build rather than
   * merely lose a colour.
   */
  passthrough: { light: ThemeTokens; dark: ThemeTokens };
  /** Values no theme can carry — see {@link UnresolvedToken} */
  unresolved: Array<UnresolvedToken>;
};

/** Pull `--name: value` pairs out of a single-block stylesheet. */
const parseBlock = (css: string): ThemeTokens => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: ThemeTokens = {};

  for (const [, name, value] of withoutComments.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  )) {
    tokens[name] = value.replace(/\s+/g, ' ').trim();
  }

  return tokens;
};

/** Every palette entry by name, so `var(--color-…)` can be read back. */
const paletteLiterals = new Map<string, string>();
for (const family of COLOR_FAMILIES) {
  for (const step of COLOR_SHADES) {
    const name = `${family}-${step}`;
    paletteLiterals.set(name, paletteColor(name as PaletteColor));
  }
}
for (const name of ['white', 'black']) {
  paletteLiterals.set(name, paletteColor(name as PaletteColor));
}

/**
 * A colour reduced to something comparable.
 *
 * The hue is dropped when there is no chroma to carry it: `oklch(1 0 0)` and
 * `#fff` are the same white, and keeping a hue of `0` against a hue of `NaN`
 * reports every one of them as a difference.
 */
const canonicalColor = (value: string): string | null => {
  const color = parseColor(value);
  if (!color) {
    return null;
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  const chroma = round(color.c);
  const hue = chroma === 0 || Number.isNaN(color.h) ? 0 : round(color.h);

  return `oklch:${round(color.l)},${chroma},${hue},${alphaOf(value)}`;
};

/**
 * The alpha a colour carries, defaulting to opaque.
 *
 * `parseColor` returns lightness, chroma and hue and nothing else, so a
 * translucent colour and its opaque twin canonicalise identically. That made
 * `oklch(1 0 0 / 90%)` compare equal to a generated `var(--background)` of
 * white — the override was judged redundant, dropped, and a theme's translucent
 * chrome quietly went solid on the way back out.
 */
const alphaOf = (value: string): number => {
  const match = /\/\s*([\d.]+)(%?)\s*\)\s*$/.exec(value.trim());
  if (!match) {
    return 1;
  }

  const raw = Number(match[1]);
  return Number.isNaN(raw) ? 1 : match[2] ? raw / 100 : raw;
};

/** A `var()` naming another token in the same block, not a palette entry. */
const aliasTarget = (value: string): string | null => {
  const match = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value.trim());
  return match && !match[1].startsWith('--color-') ? match[1] : null;
};

/** The palette entry a `var(--color-…)` names, if it names one. */
const paletteRef = (value: string): string | null => {
  const match = /^var\(\s*--color-([a-z0-9-]+)\s*\)$/i.exec(value.trim());
  return match && paletteLiterals.has(match[1]) ? match[1] : null;
};

/**
 * Reduce a value to what it actually paints.
 *
 * Follows `var()` through the block it was declared in, so a token aliasing a
 * token aliasing a palette entry compares equal to the entry itself.
 */
const resolve = (value: string, tokens: ThemeTokens, depth = 0): string => {
  if (depth > 12) {
    return value;
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();
  const palette = paletteRef(trimmed);
  if (palette) {
    return resolve(paletteLiterals.get(palette) as string, tokens, depth + 1);
  }

  const alias = aliasTarget(trimmed);
  if (alias) {
    return alias in tokens
      ? resolve(tokens[alias], tokens, depth + 1)
      : trimmed;
  }

  return canonicalColor(trimmed) ?? trimmed;
};

/**
 * Whether two declarations say the same thing.
 *
 * Two rules, and both are needed. Aliasing the same token is a match whatever
 * that token holds — otherwise every alias whose target is itself overridden is
 * reported as a second override. Failing that, resolving to the same colour is
 * a match, which is what lets `var(--color-white)` equal `oklch(1 0 0)`.
 */
const same = (
  have: string,
  want: string,
  haveTokens: ThemeTokens,
  wantTokens: ThemeTokens
): boolean => {
  const from = aliasTarget(have);
  const to = aliasTarget(want);

  if (from && to && from === to) {
    return true;
  }

  return resolve(have, haveTokens) === resolve(want, wantTokens);
};

/** A value Tailwind has to resolve at build time is not a value yet. */
const isBuildTimeCall = (value: string): boolean => /\btheme\s*\(/.test(value);

/**
 * A `var(--color-…)` naming no palette entry there is.
 *
 * It resolves to nothing at all, which no amount of rewriting can fix — and
 * `spotlight` has three of them, pointing at `--color-brand-600` and
 * `--color-brand-500`, where the token it means is `--brand-600`.
 *
 * Every reference in the value is checked, not the value as a whole: a
 * `color-mix()` around a real palette entry is a perfectly good colour, and
 * judging it by whether the *whole* value is a palette reference condemns it.
 */
const namesNothing = (value: string): boolean =>
  [...value.matchAll(/var\(\s*--color-([a-z0-9-]+)\s*[,)]/gi)].some(
    ([, name]) => !paletteLiterals.has(name)
  );

/**
 * Rewrite a palette alias to its literal.
 *
 * An override is applied verbatim in either format, so one holding
 * `var(--color-zinc-600)` resolves to nothing the moment the theme is injected
 * at runtime — Tailwind only emits the shades something referenced at build
 * time. Aliases to the theme's own tokens are left alone: those are declared in
 * the same block and resolve wherever it lands.
 *
 * Every occurrence, not only a value that is nothing but a reference: a
 * `color-mix()` hides one in the middle, and leaving that one alone ships the
 * same dead colour with more steps.
 */
const asLiteral = (value: string): string =>
  value.replace(
    /var\(\s*--color-([a-z0-9-]+)\s*\)/gi,
    (whole, name: string) => paletteLiterals.get(name) ?? whole
  );

/** The candidate scoring best against the tokens it is responsible for. */
const bestOf = <T>(
  candidates: ReadonlyArray<T>,
  score: (candidate: T) => number
): T =>
  candidates.reduce((best, candidate) =>
    score(candidate) < score(best) ? candidate : best
  );

/**
 * Which family a `--brand-*` ramp was cut from.
 *
 * Read off the ramp rather than inferred from what the brand reaches, because
 * the ramp is the one place the brand is written down whole — and a theme may
 * point nothing else at it.
 */
const brandFromRamp = (light: ThemeTokens): ColorFamily | null => {
  const declared = COLOR_SHADES.filter(
    (step) => `--brand-${step}` in light
  ).map((step) => [step, resolve(light[`--brand-${step}`], light)] as const);

  if (!declared.length) {
    return null;
  }

  const matches = (family: ColorFamily) =>
    declared.filter(
      ([step, value]) =>
        resolve(paletteColor(`${family}-${step}` as PaletteColor), light) ===
        value
    ).length;

  const best = bestOf(COLOR_FAMILIES, (family) => -matches(family));
  return matches(best) > 0 ? best : null;
};

/** Which registered family a font stack came from. */
const fontFromStack = (
  slot: FontSlot,
  value: string | undefined
): string | null => {
  if (!value) {
    return null;
  }

  const wanted = value.replace(/\s+/g, ' ').trim();
  const match = FONT_FAMILIES.filter((font) => font.slots.includes(slot)).find(
    (font) => fontStack(slot, font.id).replace(/\s+/g, ' ').trim() === wanted
  );

  return match?.id ?? null;
};

/** A token the candidate cannot explain at all, against one it merely spells differently. */
const MISS = 1000;

/**
 * How badly a candidate recipe explains the tokens it is responsible for.
 *
 * Scoped to a chosen set of tokens so each decision is judged on what it
 * actually decides — scoring a whole theme per candidate would let an unrelated
 * override sway an unrelated choice.
 *
 * Writing the same text as the file is worth more than merely painting the same
 * colour, and that is the whole tie-break for the link: `var(--primary)` and
 * `var(--brand-700)` are one colour while the primary *is* the brand step, and
 * two different decisions the moment it stops being. The file already says
 * which one was meant; preferring the exact spelling is how that survives.
 */
const misses = (
  recipe: ThemeRecipe,
  file: { light: ThemeTokens; dark: ThemeTokens },
  tokens: ReadonlyArray<string>
): number => {
  const built = buildThemeTokens(recipe, {}, 'alias');
  const builtDark = { ...built.light, ...built.dark };
  const fileDark = { ...file.light, ...file.dark };

  let score = 0;
  for (const token of tokens) {
    for (const [want, wantTokens, have, haveTokens] of [
      [built.light[token], built.light, file.light[token], file.light],
      [built.dark[token], builtDark, fileDark[token], fileDark]
    ] as const) {
      if (want === undefined) {
        continue;
      }
      if (have === undefined || !same(have, want, haveTokens, wantTokens)) {
        score += MISS;
      } else if (have.replace(/\s+/g, ' ').trim() !== want) {
        score += 1;
      }
    }
  }

  return score;
};

/**
 * Read a committed theme back into the decisions that could have produced it.
 *
 * The inverse of {@link buildThemeTokens}, and deliberately not a perfect one:
 * a token map cannot be reversed into a recipe, so this finds the recipe that
 * explains the most of it and hands back the remainder as overrides. A theme
 * need not be fully derivable to be editable — it needs a recipe whose controls
 * still move something, which is what choosing the best fit buys.
 *
 * Each decision is fitted against the tokens it alone governs. Brand comes off
 * the `--brand-*` ramp, base off the shadcn neutrals, and the rest off their
 * own groups, in that order — the later choices resolve against the families
 * the earlier ones settled.
 *
 * @param file - The theme's declarations, per scheme
 * @returns The recipe, what it cannot account for, and what it never generates
 */
export function parseThemeTokens(file: {
  light: ThemeTokens;
  dark: ThemeTokens;
}): ParsedTheme {
  const radius = file.light['--radius'];
  const draft: ThemeRecipe = {
    ...DEFAULT_RECIPE,
    radius: radius?.length ? radius : DEFAULT_RECIPE.radius,
    brandFamily: brandFromRamp(file.light) ?? DEFAULT_RECIPE.brandFamily,
    fontBody:
      fontFromStack('body', file.light['--core-font-body']) ??
      DEFAULT_RECIPE.fontBody,
    fontHeading:
      fontFromStack('heading', file.light['--core-font-heading']) ??
      DEFAULT_RECIPE.fontHeading
  };

  // The shadcn neutrals, which since the primary moved out of them are driven
  // by the base family and nothing else
  const neutralTokens = Object.keys(
    buildThemeTokens(draft, {}, 'alias').light
  ).filter(
    (token) =>
      !token.startsWith('--brand-') &&
      !token.startsWith('--chart-') &&
      !token.startsWith('--core-') &&
      !token.startsWith('--radius')
  );

  const withBase = {
    ...draft,
    baseFamily: bestOf(COLOR_FAMILIES, (baseFamily) =>
      misses({ ...draft, baseFamily }, file, neutralTokens)
    ) as ColorFamily
  };

  const PRIMARY_TOKENS = [
    '--primary',
    '--primary-foreground',
    '--ring',
    '--sidebar-primary',
    '--sidebar-primary-foreground',
    '--sidebar-ring'
  ];
  const CHART_TOKENS = [1, 2, 3, 4, 5].map((n) => `--chart-${n}`);
  const SURFACE_TOKENS = [
    '--core-background-body',
    '--core-background-content',
    '--core-content-border'
  ];

  const withGroups: ThemeRecipe = {
    ...withBase,
    primarySource: bestOf(['brand', 'base'] as const, (primarySource) =>
      misses({ ...withBase, primarySource }, file, PRIMARY_TOKENS)
    ),
    chartSource: bestOf(['brand', 'shadcn', 'base'] as const, (chartSource) =>
      misses({ ...withBase, chartSource }, file, CHART_TOKENS)
    ),
    surface: bestOf(['flat', 'layered'] as const, (surface) =>
      misses({ ...withBase, surface }, file, SURFACE_TOKENS)
    )
  };

  // The link last: following the primary only makes sense once the primary is
  // settled, and the shade decides nothing when it does.
  //
  // Order is the tie-break, and there are two ties to break. A link that simply
  // equals the primary reads equally well either way, so the brand step is
  // preferred — it keeps the link a decision of its own rather than welding it
  // to the primary, which is the difference the moment the primary moves. And a
  // theme declaring no link at all matches everything, so the default shade
  // leads the brand candidates.
  const linkCandidates: Array<Pick<ThemeRecipe, 'linkSource' | 'linkShade'>> = [
    { linkSource: 'brand', linkShade: DEFAULT_RECIPE.linkShade },
    ...COLOR_SHADES.flatMap((light) =>
      COLOR_SHADES.map((dark) => ({
        linkSource: 'brand' as const,
        linkShade: { light, dark } as { light: ColorShade; dark: ColorShade }
      }))
    ),
    { linkSource: 'primary', linkShade: DEFAULT_RECIPE.linkShade }
  ];

  const recipe: ThemeRecipe = {
    ...withGroups,
    ...bestOf(linkCandidates, (candidate) =>
      misses({ ...withGroups, ...candidate }, file, ['--core-link'])
    )
  };

  const fileDark = { ...file.light, ...file.dark };
  const overrides = { light: {} as ThemeTokens, dark: {} as ThemeTokens };
  const unresolved: Array<UnresolvedToken> = [];

  /**
   * Collect what the recipe plus the overrides so far still cannot say.
   *
   * Run to a fixpoint rather than once, because an override changes what the
   * aliases above it resolve to. `spotlight` sets `--core-background-content`
   * to a solid grey and `--card` to a translucent one; against the bare recipe
   * the first agrees with its generated `var(--card)` and is dropped, and then
   * the second is overridden and the page background silently goes translucent.
   * Comparing again after each pass is what closes that.
   */
  const collect = (): number => {
    const built = buildThemeTokens(recipe, overrides, 'alias');
    const builtDark = { ...built.light, ...built.dark };
    let added = 0;

    // The dark map carries only what the template changes per scheme; the core
    // and prose layers are declared once and cascade. A theme may still restate
    // one in dark — `spotlight` restates thirty-five of them, which is its whole
    // dark personality — so a dark declaration of a light-only token is judged
    // against what would have cascaded into its place.
    const darkTokens = new Set([
      ...Object.keys(built.dark),
      ...Object.keys(file.dark).filter((token) => token in built.light)
    ]);

    for (const [scheme, tokens, wanted, wantedTokens, have, haveTokens] of [
      [
        'light',
        Object.keys(built.light),
        built.light,
        built.light,
        file.light,
        file.light
      ],
      ['dark', [...darkTokens], builtDark, builtDark, file.dark, fileDark]
    ] as const) {
      for (const token of tokens) {
        const want = wanted[token];
        if (want === undefined || token in overrides[scheme]) {
          continue;
        }
        // A dark token the file omits is not missing — it cascades from light,
        // and that cascaded value is what the theme actually paints
        const value =
          have[token] ?? (scheme === 'dark' ? file.light[token] : undefined);

        if (
          value === undefined ||
          same(value, want, haveTokens, wantedTokens)
        ) {
          continue;
        }
        if (isBuildTimeCall(value)) {
          unresolved.push({ scheme, token, value, reason: 'build-time-call' });
        } else if (namesNothing(value)) {
          unresolved.push({
            scheme,
            token,
            value,
            reason: 'unknown-reference'
          });
        }

        overrides[scheme][token] = asLiteral(value);
        added++;
      }
    }

    return added;
  };

  // Each pass can only add, and only from a finite token set, so this settles.
  // The bound is a guard against a cycle, not an expected exit.
  for (let pass = 0; pass < 8 && collect() > 0; pass++) {
    /* keep collecting */
  }

  const generated = buildThemeTokens(recipe, overrides, 'alias');
  const passthrough = { light: {} as ThemeTokens, dark: {} as ThemeTokens };

  for (const [scheme, block] of [
    ['light', file.light],
    ['dark', file.dark]
  ] as const) {
    for (const [token, value] of Object.entries(block)) {
      if (token in generated.light || token in generated.dark) {
        continue;
      }
      passthrough[scheme][token] = value;
    }
  }

  return { recipe, overrides, passthrough, unresolved };
}

/**
 * The same, from a committed theme's files.
 *
 * Kept as the entry point the export path already speaks in, so a theme can be
 * round-tripped through {@link themeFiles} without either side knowing how the
 * other stores its tokens.
 *
 * @param files - A theme's token files; `tailwind-base.css` is unread
 * @returns What {@link parseThemeTokens} returns
 */
export function parseTheme(
  files: Pick<ThemeFiles, 'tokens-light.css' | 'tokens-dark.css'>
): ParsedTheme {
  return parseThemeTokens({
    light: parseBlock(files['tokens-light.css']),
    dark: parseBlock(files['tokens-dark.css'])
  });
}

/**
 * What the studio is handed when a built-in is opened.
 *
 * Two things happen here, and both have to happen in one place or the card and
 * the studio disagree about the theme.
 *
 * A theme's own declarations are folded in with what the recipe cannot say.
 * `parseTheme` keeps them apart because writing a committed file back wants
 * them apart; nothing else does. A saved theme is reopened from its recipe and
 * its overrides, so a declaration travelling any other way is lost the moment
 * the fork is closed — and `codeware`'s `--core-surface-invert` then points at
 * an `--eerie-black` that no longer exists.
 *
 * A value the parser could not carry is dropped rather than copied. It would
 * resolve to nothing in a runtime theme, and the collection refuses a dangling
 * alias outright — so keeping it turns a fork into a save that fails, naming a
 * token the author never wrote. Falling back to the recipe is what the card
 * promises, and this is where that promise is kept.
 */
export function editableTokens({
  overrides,
  passthrough,
  unresolved
}: ParsedTheme): { light: ThemeTokens; dark: ThemeTokens } {
  const carried = (tokens: ThemeTokens, scheme: 'light' | 'dark') =>
    Object.fromEntries(
      Object.entries(tokens).filter(
        ([token]) =>
          !unresolved.some(
            (entry) => entry.scheme === scheme && entry.token === token
          )
      )
    );

  return {
    light: carried({ ...passthrough.light, ...overrides.light }, 'light'),
    dark: carried({ ...passthrough.dark, ...overrides.dark }, 'dark')
  };
}
