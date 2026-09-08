import type { FeatureSectionBlock as FeatureSectionBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

import { usePayload } from '../providers/PayloadProvider';
import { resolveLinkGroup } from '../utils/resolve-link-group';

import { ImageBlock } from './ImageBlock';

/**
 * Feature section — a header, one visual, and a row of supporting points.
 *
 * The unit a long marketing page repeats. Unlike `showcase`, which lists peer
 * items, this makes a single claim and puts the evidence under it.
 */
export const FeatureSectionBlock: React.FC<FeatureSectionBlockProps> = ({
  eyebrow,
  heading,
  intro,
  enableLink,
  link,
  media,
  subFeatures
}) => {
  const { navigate } = usePayload();

  const resolvedLink = enableLink && link ? resolveLinkGroup(link) : null;
  const points = subFeatures ?? [];

  return (
    <section>
      <div className="max-w-2xl">
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
        {resolvedLink && (
          <button
            type="button"
            onClick={() => navigate(resolvedLink.path, resolvedLink.newTab)}
            className="border-border text-foreground hover:border-core-interactive mt-6 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            {resolvedLink.label}
            <ArrowRightIcon className="size-4" />
          </button>
        )}
      </div>

      {/* An id alone is an unpopulated relation, which renders as nothing */}
      {media && typeof media === 'object' && (
        <div className="mt-9">
          <ImageBlock media={media} hideCaption />
        </div>
      )}

      {points.length > 0 && (
        // One divided row rather than cards: the visual above is already a
        // bordered object, and these are subordinate to it
        <div
          className={cn(
            'border-border mt-8 grid grid-cols-1 gap-y-7 border-t pt-7',
            {
              'sm:grid-cols-2 sm:gap-y-0': points.length === 2,
              'sm:grid-cols-3 sm:gap-y-0': points.length === 3,
              // Four wrap to two columns before they cramp, so the rows only
              // close up once `lg` puts them back on one line
              'sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0': points.length >= 4
            }
          )}
        >
          {points.map((point, index) => {
            // The divider belongs *between* items, so whichever item opens a
            // row never draws one. Only the four-point layout wraps, and it
            // wraps at `sm` and unwraps at `lg` — so which items open a row
            // differs by breakpoint, and a single index rule gets one wrong.
            const wraps = points.length >= 4;
            const opensRow = wraps ? index % 2 === 0 : index === 0;
            const closesRow = wraps
              ? index % 2 === 1
              : index === points.length - 1;

            return (
              <div
                key={point.id ?? index}
                className={cn(
                  'sm:px-7',
                  opensRow ? 'sm:pl-0' : 'border-border/60 sm:border-l',
                  closesRow && 'sm:pr-0',
                  // One row again: every item but the first opens nothing
                  wraps && [
                    index === 0 ? 'lg:pl-0' : 'lg:border-l lg:pl-7',
                    index === points.length - 1 ? 'lg:pr-0' : 'lg:pr-7'
                  ]
                )}
              >
                {/* A size step as well as weight and ink: at one size the two
                    lines read as a single grey paragraph. Deliberately not
                    brand — `--core-link` is already the eyebrow above, and
                    `--core-interactive` is a border token that never has to
                    clear 4.5:1 as text */}
                <p className="text-foreground text-sm font-semibold">
                  {point.title}
                </p>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
                  {point.body}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
