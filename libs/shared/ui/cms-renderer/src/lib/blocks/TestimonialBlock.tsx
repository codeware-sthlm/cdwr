import type { TestimonialBlock as TestimonialBlockProps } from '@codeware/shared/util/payload-types';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

import { usePayload } from '../providers/PayloadProvider';
import { resolveLinkGroup } from '../utils/resolve-link-group';

import { ImageBlock } from './ImageBlock';

/**
 * Testimonial — the one block where the claim comes from outside the site.
 *
 * Quiet by design: a surface and a rule rather than a card, so it reads as
 * evidence set into the page rather than another thing being sold.
 */
export const TestimonialBlock: React.FC<TestimonialBlockProps> = ({
  quote,
  author,
  logo,
  enableLink,
  link
}) => {
  const { navigate } = usePayload();

  const resolvedLink = enableLink && link ? resolveLinkGroup(link) : null;
  // An id alone is an unpopulated relation, which ImageBlock renders as nothing
  const avatar =
    author?.avatar && typeof author.avatar === 'object' ? author.avatar : null;
  const shownLogo = logo && typeof logo === 'object' ? logo : null;

  if (!quote) return null;

  return (
    <section>
      <figure className="bg-card/50 border-border flex flex-col gap-6 rounded-xl border p-7 sm:flex-row sm:items-start sm:gap-9 sm:p-9">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <blockquote className="text-foreground text-lg leading-relaxed font-medium text-balance">
            {`“${quote}”`}
          </blockquote>

          <figcaption className="flex items-center gap-3">
            {avatar && (
              <div className="size-9 shrink-0 overflow-hidden rounded-full">
                <ImageBlock media={avatar} hideCaption />
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-sm font-medium">
                {author?.name}
              </span>
              {author?.role && (
                <span className="text-muted-foreground truncate text-xs">
                  {author.role}
                </span>
              )}
            </div>
          </figcaption>
        </div>

        {(shownLogo || resolvedLink) && (
          <div className="flex shrink-0 flex-row items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start">
            {shownLogo && (
              <div className="max-w-28">
                <ImageBlock media={shownLogo} hideCaption />
              </div>
            )}
            {resolvedLink && (
              <button
                type="button"
                onClick={() => navigate(resolvedLink.path, resolvedLink.newTab)}
                className="text-core-link inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap hover:underline"
              >
                {resolvedLink.label}
                <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        )}
      </figure>
    </section>
  );
};
