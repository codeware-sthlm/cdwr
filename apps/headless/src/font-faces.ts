import { BUILT_IN_TOKENS } from '@codeware/shared/theme';
import {
  entitledFonts,
  fontFaceCss,
  selfServedFontsIn
} from '@codeware/shared/util/color';

type Tokens = Record<string, unknown>;
type CustomTheme = { tokensLight: Tokens; tokensDark: Tokens };

/**
 * The `@font-face` rules for the licensed typefaces the site's themes name,
 * written only for a deployment entitled to them.
 *
 * Driven off the tokens because those are what renders, and only for a family
 * the platform serves itself: Inter comes from the bundle.
 */
export function siteFontFaceCss(
  themes: ReadonlyArray<string>,
  customThemes: ReadonlyArray<CustomTheme>,
  restrictedFonts: string | undefined,
  assetsBase: string | undefined
): string {
  return entitledFonts(
    selfServedFontsIn([
      ...customThemes.flatMap(({ tokensLight, tokensDark }) => [
        tokensLight,
        tokensDark
      ]),
      ...themes.flatMap((name) => {
        const builtIn = BUILT_IN_TOKENS[name];
        return builtIn ? [builtIn.light, builtIn.dark] : [];
      })
    ]),
    restrictedFonts
  )
    .map((font) => fontFaceCss(font, assetsBase))
    .join('');
}
