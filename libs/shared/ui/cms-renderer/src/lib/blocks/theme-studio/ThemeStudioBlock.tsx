'use client';

import { BUILT_IN_TOKENS, themeLabel } from '@codeware/shared/theme';
import { ThemeStudio } from '@codeware/shared/ui/theme-studio';
import { parseThemeTokens } from '@codeware/shared/util/color';
import type { ThemeStudioBlock as ThemeStudioBlockProps } from '@codeware/shared/util/payload-types';
import { useMemo } from 'react';

/**
 * Theme studio — the real studio, in a page.
 *
 * The same component the admin's theme library opens, with the two things
 * that write anywhere switched off: no export to committed files, no save to
 * a site. Everything else is the studio itself — the derivation, the contrast
 * report, the randomiser — so what a visitor sees is exactly what an editor
 * gets. That is the point, and it is why this is not a lighter copy.
 *
 * Client-side by necessity: the studio is interactive and holds its state in
 * the browser, which is also what "nothing leaves your browser" means.
 */
export const ThemeStudioBlock: React.FC<ThemeStudioBlockProps> = ({
  eyebrow,
  heading,
  intro,
  startFrom,
  note
}) => {
  // The recipe is read back from the committed theme's tokens, the way the
  // admin opens a platform theme — so the studio starts on the real thing,
  // not on an approximation of it. Parsed once; the tokens never change while
  // the page is up
  const recipe = useMemo(() => {
    const tokens = BUILT_IN_TOKENS[startFrom];
    return tokens ? parseThemeTokens(tokens).recipe : undefined;
  }, [startFrom]);

  return (
    <section>
      {(eyebrow || heading || intro) && (
        <div className="mb-8 max-w-2xl">
          {eyebrow && (
            <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2 className="text-core-headline mt-3 text-3xl font-semibold tracking-tight">
              {heading}
            </h2>
          )}
          {intro && (
            <p className="text-muted-foreground mt-3.5 text-base leading-relaxed">
              {intro}
            </p>
          )}
        </div>
      )}

      {/* The same tinted bar the block gallery puts above a live example, for
          the same reason: what is below it is the thing itself */}
      {note && (
        <p className="border-core-link/20 bg-core-link/10 text-foreground rounded-t-xl border border-b-0 px-4 py-2.5 text-sm">
          <span className="bg-core-link mr-2 inline-block size-2 rounded-full align-middle" />
          {note}
        </p>
      )}

      {/* Framed rather than full-screen: in the admin the studio owns the
          viewport, here it sits in a page that has its own theme around it */}
      <div
        className={`border-border bg-background overflow-hidden border ${
          note ? 'rounded-b-xl' : 'rounded-xl'
        }`}
      >
        <ThemeStudio
          recipe={recipe}
          themeName={themeLabel(startFrom)}
          themeSlug={startFrom}
          canExport={false}
          canUseRestrictedFonts={false}
        />
      </div>
    </section>
  );
};
