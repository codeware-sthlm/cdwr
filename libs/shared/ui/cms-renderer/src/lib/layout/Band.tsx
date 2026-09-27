import type { HeroBlock } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';
import { type VariantProps, cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { type DarkScope, usePayload } from '../providers/PayloadProvider';

/** A block's `band`, as the Payload field defines it */
export type SectionBand = NonNullable<HeroBlock['band']>;

/** Every band, in the order a control offers them */
export const sectionBands = [
  'none',
  'subtle',
  'strong',
  'gradient'
] as const satisfies ReadonlyArray<SectionBand>;

/** Fails to compile when the field gains a band `sectionBands` leaves out. */
export type AssertEveryBandListed<
  TMissing extends never = Exclude<SectionBand, (typeof sectionBands)[number]>
> = TMissing;

/** How a site scopes a theme's dark tokens */
const siteDarkScope = (theme: string): DarkScope => ({
  'data-theme': theme,
  className: 'dark'
});

const band = cva('', {
  variants: {
    band: {
      none: '',
      // Muted on a light page; on a dark one the theme picks a tone apart from
      // the surface beneath, which a layered sheet has already made the card
      subtle: 'bg-core-band-subtle',
      // Tokens resolve per element, so the theme's dark block applies from
      // here down and the text colour has to be stated again to pick it up
      strong:
        'bg-core-background-content text-core-text in-[.dark]:bg-core-band-strong',
      // Dark-scoped like `strong`, painted by the fit below: a sheet paints
      // only the layer that reaches past it, so the run is one piece
      gradient: 'text-core-band-gradient-text'
    } satisfies Record<SectionBand, string>,
    fit: {
      // Between the container's outer and inner layers, so it spans the sheet
      // and the inner layer keeps the content where it always is
      sheet: '',
      // Inside a column or a gallery frame, where there is no sheet to span
      contained: 'rounded-2xl'
    }
  },
  compoundVariants: [
    {
      band: ['subtle', 'strong', 'gradient'],
      fit: 'sheet',
      // The colour is repeated on a layer the theme lets reach past the sheet,
      // so a flat theme's band crosses the page while its content stays put
      className:
        'relative isolate py-12 before:absolute before:inset-y-0 before:inset-x-band-reach before:-z-10 before:bg-inherit md:py-16'
    },
    {
      band: ['subtle', 'strong', 'gradient'],
      fit: 'contained',
      className: 'px-6 py-10 md:px-10 md:py-12'
    },
    {
      band: 'gradient',
      fit: 'sheet',
      className:
        'before:bg-linear-to-br before:from-core-band-gradient-from before:to-core-band-gradient-to'
    },
    {
      band: 'gradient',
      fit: 'contained',
      className:
        'bg-linear-to-br from-core-band-gradient-from to-core-band-gradient-to'
    }
  ],
  defaultVariants: { band: 'none', fit: 'contained' }
});

type BandProps = React.ComponentPropsWithoutRef<'div'> & {
  band: SectionBand | null | undefined;
  fit: NonNullable<VariantProps<typeof band>['fit']>;
};

/**
 * The gradient band's own text, restated on a wrapper inside it.
 *
 * The theme's dark tokens are declared on the band element itself, so they
 * would win over anything set there; one level down, these do. The page's
 * text measures 2–4:1 on a brand surface, which is why the band has its own.
 */
const gradientText = cva(
  'contents [--core-header:var(--core-band-gradient-text)] [--core-headline:var(--core-band-gradient-text)] [--core-link:var(--core-band-gradient-text)] [--core-text:var(--core-band-gradient-text)] [--foreground:var(--core-band-gradient-text)] [--muted-foreground:var(--core-band-gradient-muted)]'
);

/**
 * The background a block is set apart with.
 *
 * `strong` is the theme's own dark scheme as a band: the element carries what
 * the host scopes the theme's dark tokens to — `data-theme` and `.dark` on a
 * site — so every block inside draws its dark look without knowing it is in a
 * band, `dark:` utilities included. `gradient` is dark-scoped the same way and
 * then gives its text colours of its own.
 */
export const Band = forwardRef<HTMLDivElement, BandProps>(function Band(
  { band: value, fit, className, children, ...props },
  ref
) {
  const { darkScope = siteDarkScope, theme } = usePayload();
  const resolved = value ?? 'none';
  const { className: scopeClassName, ...scope } =
    resolved === 'strong' || resolved === 'gradient' ? darkScope(theme) : {};

  return (
    <div
      ref={ref}
      data-band={resolved}
      {...scope}
      className={cn(band({ band: resolved, fit }), scopeClassName, className)}
      {...props}
    >
      {resolved === 'gradient' ? (
        <div className={gradientText()}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
});
