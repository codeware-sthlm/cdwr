import { Button } from '@codeware/shared/ui/shadcn/components/button';
import type { HeroBlock as HeroBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';
import { useId } from 'react';

import { usePayload } from '../../providers/PayloadProvider';
import { Illustration } from '../../utils/Illustration';
import { resolveLinkGroup } from '../../utils/resolve-link-group';
import { TenantIcon } from '../../utils/TenantIcon';
import { ImageBlock } from '../image/ImageBlock';

/**
 * Hero block — page opener with badge, headline, lede and up to two CTA buttons.
 */
export const HeroBlock: React.FC<HeroBlockProps> = ({
  badge,
  heading,
  lede,
  actions,
  media,
  illustration,
  layout,
  decoration
}) => {
  const fadeId = useId();
  const { navigate, iconConfig } = usePayload();
  // Whitespace left in a cleared field is not a drawing
  const fill = layout === 'fill';
  const drawing = !fill && illustration?.trim() ? illustration : null;
  const decorated = decoration === 'vineyard-rows';

  // Rows converge on a point above the block, as vines do toward the horizon
  const rows = Array.from({ length: 21 }, (_, i) => -560 + i * 120);

  const buttons = !!actions?.length && (
    <div
      className={cn(
        'flex flex-wrap gap-3',
        fill ? 'mt-9 justify-center' : 'mt-8'
      )}
    >
      {actions.map((action, i) => {
        const resolved = resolveLinkGroup(action.link);
        if (!resolved) return null;
        return (
          <Button
            key={i}
            variant={action.emphasis === 'secondary' ? 'outline' : 'default'}
            onClick={() => navigate(resolved.path, resolved.newTab)}
          >
            {resolved.label}
          </Button>
        );
      })}
    </div>
  );

  // Spans the band reach so it crosses the sheet like a band does, and fades
  // into the content background token so it meets the page at any theme
  const rowsDrawing = decorated && (
    <svg
      viewBox="0 0 1280 260"
      preserveAspectRatio="none"
      aria-hidden="true"
      // Behind the text: the fade is painted in the page colour, and over the
      // button it would wash it out
      className="inset-x-band-reach pointer-events-none absolute bottom-0 -z-10 h-36 md:h-56"
    >
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            stopColor="var(--core-background-content)"
            stopOpacity="1"
          />
          <stop
            offset="1"
            stopColor="var(--core-background-content)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      >
        {rows.map((x2) => (
          <path key={x2} d={`M640 0 L${x2} 260`} />
        ))}
      </g>
      <rect width="1280" height="120" fill={`url(#${fadeId})`} />
    </svg>
  );

  if (fill) {
    return (
      <section
        className={cn(
          // The header is 4rem; the rest of the first screen is the hero's
          'relative isolate flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center text-center',
          // Room for the rows, so the centred text stays clear of them
          decorated && 'pb-36 md:pb-56'
        )}
      >
        {badge && (
          <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
            {badge}
          </p>
        )}
        <h1 className="text-core-headline mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-balance md:text-7xl lg:text-8xl">
          {heading}
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed md:text-xl">
          {lede}
        </p>
        {buttons}
        {rowsDrawing}
      </section>
    );
  }

  return (
    <section className={cn(decorated && 'relative isolate')}>
      {/* A drawing sits beside the text on a wide screen, where the text alone
          leaves half the row empty; an image keeps a row of its own */}
      <div
        className={cn(
          drawing &&
            'grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12'
        )}
      >
        <div>
          {badge && (
            <div className="border-border bg-card text-core-link mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              <TenantIcon config={iconConfig} size={16} />
              <span>{badge}</span>
            </div>
          )}
          <h1 className="text-core-headline max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            {heading}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
            {lede}
          </p>
          {buttons}
        </div>
        {drawing && <Illustration svg={drawing} />}
      </div>
      {/* An id alone is an unpopulated relation, which renders as nothing */}
      {!drawing && media && typeof media === 'object' && (
        <div className="mt-12">
          <ImageBlock media={media} hideCaption />
        </div>
      )}
      {rowsDrawing}
    </section>
  );
};
