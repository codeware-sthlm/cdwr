import { cn } from '@codeware/shared/util/ui';
import { type VariantProps, cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { type DarkScope, usePayload } from '../providers/PayloadProvider';

/** How a site scopes a theme's dark tokens */
const siteDarkScope = (theme: string): DarkScope => ({
  'data-theme': theme,
  className: 'dark'
});

const band = cva('', {
  variants: {
    band: {
      none: '',
      // A dark page lifts to the card colour: muted is too close to some
      // themes' link colour there, and the inverted surface to their muted text
      subtle: 'bg-muted dark:bg-card/50',
      // Tokens resolve per element, so the theme's dark block applies from
      // here down and the text colour has to be stated again to pick it up
      strong: 'bg-core-background-content text-core-text in-[.dark]:bg-card'
    },
    fit: {
      // Between the container's outer and inner layers, so it spans the sheet
      // and the inner layer keeps the content where it always is
      sheet: '',
      // Inside a column or a gallery frame, where there is no sheet to span
      contained: 'rounded-2xl'
    }
  },
  compoundVariants: [
    { band: ['subtle', 'strong'], fit: 'sheet', className: 'py-12 md:py-16' },
    {
      band: ['subtle', 'strong'],
      fit: 'contained',
      className: 'px-6 py-10 md:px-10 md:py-12'
    }
  ],
  defaultVariants: { band: 'none', fit: 'contained' }
});

export type SectionBand = NonNullable<VariantProps<typeof band>['band']>;

type BandProps = React.ComponentPropsWithoutRef<'div'> & {
  band: SectionBand | null | undefined;
  fit: NonNullable<VariantProps<typeof band>['fit']>;
};

/**
 * The background a block is set apart with.
 *
 * `strong` is the theme's own dark scheme as a band: the element carries what
 * the host scopes the theme's dark tokens to — `data-theme` and `.dark` on a
 * site — so every block inside draws its dark look without knowing it is in a
 * band, `dark:` utilities included.
 */
export const Band = forwardRef<HTMLDivElement, BandProps>(function Band(
  { band: value, fit, className, ...props },
  ref
) {
  const { darkScope = siteDarkScope, theme } = usePayload();
  const resolved = value ?? 'none';
  const { className: scopeClassName, ...scope } =
    resolved === 'strong' ? darkScope(theme) : {};

  return (
    <div
      ref={ref}
      data-band={resolved}
      {...scope}
      className={cn(band({ band: resolved, fit }), scopeClassName, className)}
      {...props}
    />
  );
});
