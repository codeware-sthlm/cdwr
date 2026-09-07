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

      {media && (
        <div className="mt-9">
          <ImageBlock media={media} hideCaption />
        </div>
      )}

      {points.length > 0 && (
        // One divided row rather than cards: the visual above is already a
        // bordered object, and these are subordinate to it
        <div
          className={cn(
            'border-border mt-8 grid grid-cols-1 gap-y-7 border-t pt-7 sm:gap-y-0',
            {
              'sm:grid-cols-2': points.length === 2,
              'sm:grid-cols-3': points.length === 3,
              'sm:grid-cols-2 lg:grid-cols-4': points.length >= 4
            }
          )}
        >
          {points.map((point, index) => (
            <div
              key={point.id ?? index}
              className={cn(
                // The divider belongs between items, so the first in each row
                // never draws one — which is why the rule follows the count
                'sm:px-7 sm:first:pl-0 sm:last:pr-0',
                index > 0 && 'border-border/60 sm:border-l'
              )}
            >
              <p className="text-foreground text-sm font-semibold">
                {point.title}
              </p>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
