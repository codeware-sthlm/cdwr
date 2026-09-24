'use client';

import { BUILT_IN_TOKENS, themeLabel } from '@codeware/shared/theme';
import { ThemeStudio } from '@codeware/shared/ui/theme-studio';
import { parseThemeTokens } from '@codeware/shared/util/color';
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
  // The recipe is read back from the committed theme's tokens, the way the
  // admin opens a platform theme — so the studio starts on the real thing,
  // not on an approximation of it. Parsed once; the tokens never change while
  // the page is up
  const recipe = useMemo(() => {
    const tokens = BUILT_IN_TOKENS[startFrom];
    return tokens ? parseThemeTokens(tokens).recipe : undefined;
  }, [startFrom]);

  return (
    <ThemeStudio
      recipe={recipe}
      themeName={themeLabel(startFrom)}
      themeSlug={startFrom}
      canExport={false}
      canUseRestrictedFonts={false}
    />
  );
}
