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
