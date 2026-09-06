import {
  DEFAULT_RECIPE,
  type ThemeRecipe,
  buildThemeTokens
} from './build-theme-tokens';
import { contrastFailures } from './contrast';
import { fontsForSlot } from './fonts';
import { COLOR_FAMILIES, type ColorShade, NEUTRAL_FAMILIES } from './palette';

/**
 * A brand wants a hue; the neutrals are what the base is for.
 *
 * From `COLOR_FAMILIES` rather than `tailwind.names`, so a family we ship
 * ourselves is reachable here too — filtering the Tailwind list left one
 * half-present: nameable by the parser, unrollable by the button.
 */
const NEUTRALS: ReadonlySet<string> = new Set(NEUTRAL_FAMILIES);

const BRAND_CANDIDATES = COLOR_FAMILIES.filter((name) => !NEUTRALS.has(name));

const RADII = ['0', '0.35rem', '0.625rem', '1rem'];

/**
 * Only what a tenant may keep.
 *
 * Rolling a licensed family would hand an author a theme the collection then
 * refuses to save — a dead end reached by pressing the fun button.
 */
const FONT_CANDIDATES = {
  body: fontsForSlot('body'),
  heading: fontsForSlot('heading')
} as const;
const SURFACES = ['flat', 'layered'] as const;
const LINK_LIGHT: Array<ColorShade> = ['600', '700', '800'];
const LINK_DARK: Array<ColorShade> = ['300', '400', '500'];

/**
 * Enough to find a passing combination without spinning if one cannot be found.
 *
 * Most rolls pass first time; the ones that do not are pale brands at a light
 * link step.
 */
const MAX_ATTEMPTS = 25;

const pick = <T>(items: ReadonlyArray<T>, random: () => number): T =>
  items[Math.floor(random() * items.length)];

/**
 * Roll a theme that is guaranteed to be readable.
 *
 * Rerolls until every contrast pair passes in both schemes, so the button can
 * never hand an author a theme the studio would then refuse to save. That is
 * the whole point of rolling against a checker rather than a palette.
 *
 * Falls back to the default recipe if nothing passes in {@link MAX_ATTEMPTS} —
 * unreachable with the current template, but a caller should never receive a
 * failing theme just because the dice were unkind.
 *
 * @param random - Source of randomness, injectable for tests
 * @returns A recipe whose theme passes WCAG AA
 */
export function randomRecipe(random: () => number = Math.random): ThemeRecipe {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const recipe: ThemeRecipe = {
      baseFamily: pick(NEUTRAL_FAMILIES, random),
      brandFamily: pick(BRAND_CANDIDATES, random),
      surface: pick(SURFACES, random),
      radius: pick(RADII, random),
      linkShade: {
        light: pick(LINK_LIGHT, random),
        dark: pick(LINK_DARK, random)
      },
      fontBody: pick(FONT_CANDIDATES.body, random).id,
      fontHeading: pick(FONT_CANDIDATES.heading, random).id,
      // Not rolled, deliberately. A neutral primary with links following it
      // leaves a link the same colour as the text around it — unreadable in a
      // way the contrast check cannot see, because link and body text are not
      // one of its pairs. The roll is for colour, not for structure.
      primarySource: DEFAULT_RECIPE.primarySource,
      chartSource: DEFAULT_RECIPE.chartSource,
      linkSource: DEFAULT_RECIPE.linkSource
    };

    const { light, dark } = buildThemeTokens(recipe);
    const failures =
      contrastFailures(light).length +
      // Dark holds only what changes, so it is checked as the browser sees it
      contrastFailures({ ...light, ...dark }).length;

    if (failures === 0) {
      return recipe;
    }
  }

  return DEFAULT_RECIPE;
}
