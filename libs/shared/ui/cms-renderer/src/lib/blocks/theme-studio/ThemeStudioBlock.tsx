'use client';

import type { ThemeStudioBlock as ThemeStudioBlockProps } from '@codeware/shared/util/payload-types';
import { Suspense, lazy } from 'react';

/**
 * Theme studio — the real studio, in a page.
 *
 * The same component the admin's theme library opens, with the two things
 * that write anywhere switched off: no export to committed files, no save to
 * a site. Everything else is the studio itself — the derivation, the contrast
 * report, the randomiser — so what a visitor sees is exactly what an editor
 * gets. That is the point, and it is why this is not a lighter copy.
 *
 * The studio itself lives behind a lazy import. The renderer's block map is a
 * client component, so everything it names ships to every page; the studio
 * and its colour engine should reach only the page that shows them.
 */
const ThemeStudioEmbed = lazy(() => import('./ThemeStudioEmbed'));

export const ThemeStudioBlock: React.FC<ThemeStudioBlockProps> = ({
  eyebrow,
  heading,
  intro,
  startFrom,
  note
}) => (
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
      <Suspense
        fallback={
          <p className="text-muted-foreground px-6 py-16 text-center text-sm">
            Loading the studio…
          </p>
        }
      >
        <ThemeStudioEmbed startFrom={startFrom} />
      </Suspense>
    </div>
  </section>
);
