import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import type { ShowcaseBlock as ShowcaseBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';

import { usePayload } from '../../providers/PayloadProvider';
import { ArrowLink } from '../../utils/ArrowLink';
import { resolveLinkGroup } from '../../utils/resolve-link-group';

/**
 * Showcase block — section header with optional "all work" link, followed by
 * highlighted project rows (tag · title · description · mono meta · link).
 */
export const ShowcaseBlock: React.FC<ShowcaseBlockProps> = ({
  eyebrow,
  heading,
  intro,
  enableHeaderLink,
  link: headerLink,
  items
}) => {
  const { navigate } = usePayload();

  if (!items?.length) return null;

  const resolvedHeaderLink =
    enableHeaderLink && headerLink ? resolveLinkGroup(headerLink) : null;

  return (
    <section>
      <div className="mb-9">
        {eyebrow && (
          <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          {heading && (
            <h2 className="text-core-headline text-3xl font-semibold tracking-tight">
              {heading}
            </h2>
          )}
          {resolvedHeaderLink && (
            <ArrowLink
              onClick={() =>
                navigate(resolvedHeaderLink.path, resolvedHeaderLink.newTab)
              }
            >
              {resolvedHeaderLink.label}
            </ArrowLink>
          )}
        </div>
        {intro && (
          <p className="text-muted-foreground mt-3.5 max-w-xl text-base leading-relaxed">
            {intro}
          </p>
        )}
      </div>

      <div className="divide-border divide-y">
        {items.map((item, i) => {
          const resolvedItemLink = resolveLinkGroup(item.link);
          return (
            <div key={i} className="group py-8 first:pt-0 last:pb-0">
              {item.tag && (
                <span className="text-core-link bg-core-link/10 mb-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {item.tag}
                </span>
              )}
              <div
                className={cn(
                  'flex flex-col gap-2',
                  resolvedItemLink &&
                    'sm:flex-row sm:items-start sm:justify-between sm:gap-6'
                )}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-core-headline text-xl font-semibold">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {item.description}
                  </p>
                  {item.meta && (
                    // One badge per item of the line, split where the field's
                    // description tells the editor to separate them: a pipe,
                    // which every keyboard has, or a middle dot
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {item.meta
                        .split(/[|·]/)
                        .map((part) => part.trim())
                        .filter(Boolean)
                        .map((part) => (
                          <li key={part}>
                            <Badge variant="outline" className="font-mono">
                              {part}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                {resolvedItemLink && (
                  <ArrowLink
                    onClick={() =>
                      navigate(resolvedItemLink.path, resolvedItemLink.newTab)
                    }
                    className="mt-1 shrink-0"
                  >
                    {resolvedItemLink.label}
                  </ArrowLink>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
