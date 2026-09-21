import type { ThemeTokens } from './build-theme-tokens';
import { contrastRatio, parseColor } from './oklch';
import { resolveToken } from './references';

/** WCAG 2 minimums. Large text is 18.66px bold or 24px regular. */
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;

export type ContrastPair = {
  /** Token holding the text or mark colour */
  foreground: string;
  /** Token holding the surface behind it */
  background: string;
  /** What breaks when this pair fails */
  usage: string;
  minimum: number;
};

export type ContrastResult = ContrastPair & {
  ratio: number;
  passes: boolean;
};

/**
 * The pairs a visitor actually reads.
 *
 * Not every combination — most token pairs never meet on screen, and reporting
 * them would bury the ones that do. Each entry here is a place the renderer
 * puts one token's colour directly on another's surface.
 */
export const THEME_CONTRAST_PAIRS: Array<ContrastPair> = [
  {
    foreground: '--foreground',
    background: '--background',
    usage: 'Body text',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--muted-foreground',
    background: '--background',
    usage: 'Captions and secondary text',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--muted-foreground',
    background: '--muted',
    usage: 'Text on muted surfaces',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--card-foreground',
    background: '--card',
    usage: 'Text on cards',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--popover-foreground',
    background: '--popover',
    usage: 'Text in popovers and dropdowns',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--primary-foreground',
    background: '--primary',
    usage: 'Primary button label',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--secondary-foreground',
    background: '--secondary',
    usage: 'Secondary button label',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--accent-foreground',
    background: '--accent',
    usage: 'Hovered menu and list items',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--destructive-foreground',
    background: '--destructive',
    usage: 'Destructive button label',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--destructive-subtle',
    background: '--muted',
    usage: 'Error text on a tinted surface',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-link',
    background: '--core-background-content',
    usage: 'Links in body copy',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-headline',
    background: '--core-background-body',
    usage: 'Page headline',
    minimum: WCAG_AA_LARGE
  },
  {
    foreground: '--core-nav-link',
    background: '--core-navbar',
    usage: 'Navigation links',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-nav-link',
    background: '--core-background-content',
    usage: 'Navigation links in a flat header, which has no bar',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-action-btn-foreground',
    background: '--core-action-btn-background',
    usage: 'Header control labels and icons',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-action-btn-foreground-hover',
    background: '--core-action-btn-background',
    usage: 'Header control, hovered or selected',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-action-btn-foreground',
    background: '--core-action-btn-track',
    usage: 'Unselected segment in a flat header control',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-action-btn-foreground-hover',
    background: '--core-action-btn-track',
    usage: 'Hovered segment in a flat header control',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-nav-link',
    background: '--core-action-btn-track',
    usage: 'Menu button in a flat header',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--core-nav-link',
    background: '--core-action-btn-background',
    usage: 'Menu button in a flat header, hovered',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--sidebar-foreground',
    background: '--sidebar',
    usage: 'Sidebar text',
    minimum: WCAG_AA_NORMAL
  },
  {
    foreground: '--ring',
    background: '--background',
    usage: 'Focus ring',
    minimum: WCAG_AA_LARGE
  }
];

/**
 * Check one scheme of a theme against the pairs above.
 *
 * A dark map holds only what changes, so pass it merged over the light one —
 * that is what the browser cascades to, and checking the dark map alone would
 * miss every token it inherits.
 *
 * A pair whose colour cannot be read — an unknown token, or a value like
 * `transparent` with no fixed colour — is left out rather than reported as a
 * pass, so a failure is never hidden behind a parse miss.
 *
 * @param tokens - The resolved token map for one scheme
 * @returns One result per checkable pair
 */
export function checkContrast(tokens: ThemeTokens): Array<ContrastResult> {
  return THEME_CONTRAST_PAIRS.flatMap((pair) => {
    const foreground = parseColor(resolveToken(tokens, pair.foreground) ?? '');
    const background = parseColor(resolveToken(tokens, pair.background) ?? '');

    if (!foreground || !background) {
      return [];
    }

    const ratio = contrastRatio(foreground, background);
    return [{ ...pair, ratio, passes: ratio >= pair.minimum }];
  });
}

/** The failures only — what a studio blocks a save on. */
export const contrastFailures = (tokens: ThemeTokens): Array<ContrastResult> =>
  checkContrast(tokens).filter(({ passes }) => !passes);

/** A token a contrast pair needs, holding a value the check cannot read. */
export type UnreadableToken = {
  token: string;
  value: string;
  /** The first pair that needed it, so the message can say what breaks */
  usage: string;
};

/**
 * Tokens that defeat the check rather than fail it.
 *
 * `checkContrast` skips any pair it cannot parse, so a theme written in values
 * the parser does not understand — `hsl()`, `rgb()`, `color-mix()`,
 * `transparent`, a named colour — comes back with no failures because nothing
 * was measured. A guarantee that silently stops applying is worse than no
 * guarantee, so those are reported here and refused at the point of save.
 *
 * An **absent** token is not reported. A custom theme overrides part of a base
 * theme and inherits what it leaves out, so saying nothing about a token is
 * legitimate; saying something unreadable is not. Aliases that lead nowhere are
 * already refused by {@link brokenReferences} before this runs.
 *
 * @param tokens - The theme's tokens, merged the way the browser cascades them
 * @returns One entry per distinct unreadable token, not per pair
 */
export function unreadableTokens(tokens: ThemeTokens): Array<UnreadableToken> {
  const found: Array<UnreadableToken> = [];
  const seen = new Set<string>();

  for (const pair of THEME_CONTRAST_PAIRS) {
    for (const token of [pair.foreground, pair.background]) {
      const value = resolveToken(tokens, token);

      // Absent, or an alias to something absent: inherited, not this theme's
      if (value === null || value === '') {
        continue;
      }
      if (parseColor(value)) {
        continue;
      }
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      found.push({ token, value, usage: pair.usage });
    }
  }

  return found;
}
