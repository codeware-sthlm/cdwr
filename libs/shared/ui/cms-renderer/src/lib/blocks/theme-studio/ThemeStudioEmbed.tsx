'use client';

import { BUILT_IN_TOKENS, themeLabel } from '@codeware/shared/theme';
import { ThemeStudio } from '@codeware/shared/ui/theme-studio';
import { editableTokens, parseThemeTokens } from '@codeware/shared/util/color';
import type { ThemeStudioBlock } from '@codeware/shared/util/payload-types';
import { useMemo } from 'react';

/**
 * The heavy half of the block: the studio, the colour engine it derives with
 * and the committed token map it opens from.
 *
 * Kept in its own module so the block can load it lazily. The renderer's
 * block map is a client component, which puts every block in every page's
 * client graph — and this one is the studio. Loaded here, it reaches the
 * browser only on a page that actually renders the block.
 */
export default function ThemeStudioEmbed({
  startFrom
}: Pick<ThemeStudioBlock, 'startFrom'>) {
  // Opened exactly as the admin opens a platform theme: the recipe read back
  // from the committed tokens, plus what the recipe cannot express. The recipe
  // alone would redraw the theme's own surfaces and charts from defaults, so
  // the studio would start on something that is not the theme it names
  const opened = useMemo(() => {
    const tokens = BUILT_IN_TOKENS[startFrom];
    if (!tokens) return undefined;
    const parsed = parseThemeTokens(tokens);
    return { recipe: parsed.recipe, overrides: editableTokens(parsed) };
  }, [startFrom]);

  return (
    <ThemeStudio
      // The studio copies its opening theme into state once, on mount, so a
      // different theme has to be a different studio
      key={startFrom}
      recipe={opened?.recipe}
      overrides={opened?.overrides}
      themeName={themeLabel(startFrom)}
      themeSlug={startFrom}
      canExport={false}
      canUseRestrictedFonts={false}
    />
  );
}
