import { Image } from '@codeware/shared/ui/image';
import type { GalleryBlock as GalleryBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';

import { usePayload } from '../../providers/PayloadProvider';
import { resolveImageSources } from '../image/image-sources';

/**
 * The tilt each collage item takes, by index. Cycling three of them is enough
 * for neighbours never to match.
 */
const TILTS = ['-rotate-[1.2deg]', 'rotate-[0.8deg]', '-rotate-[0.4deg]'];

/**
 * Gallery — a heading above a set of photos, as a scrapbook collage or an even
 * row with captions.
 */
export const GalleryBlock: React.FC<GalleryBlockProps> = ({
  eyebrow,
  heading,
  intro,
  layout,
  items
}) => {
  const { payloadUrl } = usePayload();
  const isRow = layout === 'row';

  // An id alone is an unpopulated relation, which renders as nothing
  const photos = (items ?? []).flatMap((item) =>
    item.image && typeof item.image === 'object'
      ? [{ ...item, image: item.image }]
      : []
  );

  // Without a heading the photos open the block, and read as part of the
  // section above rather than as one of their own
  const hasHeader = !!(eyebrow || heading || intro);

  return (
    <section>
      {hasHeader && (
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
        </div>
      )}

      {photos.length > 0 && (
        // The slight rotations and the card frames are what make the collage
        // read as a scrapbook; `grid-flow-dense` lets a tall or wide item be
        // filled around instead of leaving holes in the grid
        <div
          className={cn(
            hasHeader && 'mt-8',
            isRow
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid grid-flow-dense auto-rows-[120px] grid-cols-2 gap-3.5 md:auto-rows-[160px] md:grid-cols-4 md:gap-4.5'
          )}
        >
          {photos.map((item, index) => {
            const { image } = item;
            const { src, sizes } = resolveImageSources(image, payloadUrl);
            const picture = (
              <Image
                sizes={sizes}
                src={src}
                alt={image.alt}
                height={image.height ?? undefined}
                width={image.width ?? undefined}
              />
            );

            if (isRow) {
              return (
                <figure key={item.id ?? index} className="m-0">
                  <div className="[&_img]:aspect-[4/3] [&_img]:w-full [&_img]:rounded-xl [&_img]:object-cover">
                    {picture}
                  </div>
                  {item.caption && (
                    <figcaption className="text-muted-foreground mt-2 text-sm">
                      {item.caption}
                    </figcaption>
                  )}
                </figure>
              );
            }

            return (
              <figure
                key={item.id ?? index}
                className={cn(
                  'bg-card m-0 rounded-sm p-1.5 shadow-md',
                  TILTS[index % TILTS.length],
                  item.size === 'wide' && 'col-span-2',
                  item.size === 'tall' && 'row-span-2'
                )}
              >
                <div className="h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:rounded-xs [&_img]:object-cover [&_picture]:block [&_picture]:h-full">
                  {picture}
                </div>
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
};
