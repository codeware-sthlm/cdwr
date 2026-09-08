import { HeroIcon, type HeroIconName } from '@codeware/shared/ui/primitives';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import type { CardBlock as CardBlockProps } from '@codeware/shared/util/payload-types';
import { type TailwindColor, tailwind } from '@codeware/shared/util/tailwind';
import { cn } from '@codeware/shared/util/ui';
import { ExternalLinkIcon, LinkIcon } from 'lucide-react';

import { useColumnSize } from '../../providers/ColumnSizeProvider';
import { usePayload } from '../../providers/PayloadProvider';
import { resolveCardBlockLink } from '../../utils/resolve-card-block-link';

/**
 * Render Payload card block cards in a responsive grid,
 * with a subtle hover effect and modern styling.
 */
export const CardBlock: React.FC<CardBlockProps> = ({ cards }) => {
  const { navigate } = usePayload();
  const { effectiveFraction = 1 } = useColumnSize({ silent: true }) ?? {};

  if (!cards?.length) {
    return null;
  }

  // Number of columns should not exceed the number of cards
  // or be more than will fit in the container
  const maxColumns = Math.min(
    cards.length,
    effectiveFraction <= 0.5 ? 1 : effectiveFraction <= 0.75 ? 2 : 3
  );

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6',
        { 'sm:grid-cols-2': maxColumns > 1 },
        { 'lg:grid-cols-3 lg:gap-8': maxColumns === 3 }
      )}
    >
      {cards.map((card, index) => {
        const { title, description, content, enableLink, link, brand } = card;
        const { icon, color } = brand ?? {};

        const hasHeader = title || description || icon;
        const linkDetails = enableLink ? resolveCardBlockLink(link) : null;

        return (
          <Card
            key={index}
            onClick={() =>
              linkDetails &&
              linkDetails.navTrigger === 'card' &&
              navigate(linkDetails.url, linkDetails.newTab)
            }
            className={cn(
              'text-card-foreground group bg-card/50 hover:bg-card overflow-hidden rounded-lg border transition-all duration-300 ease-in-out',
              {
                'cursor-pointer':
                  linkDetails && linkDetails.navTrigger === 'card'
              },
              {
                // Limit card width when a single column have more than half the page width
                'max-w-sm': maxColumns === 1 && effectiveFraction > 0.5
              }
            )}
          >
            {hasHeader && (
              <CardHeader>
                {icon && (
                  <div
                    // Workaround to prevent all colors to be bundled just-in-case:
                    // Tailwind can not resolve dynamic colors that are not pre-defined
                    // so we need to use inline styles to set the border color.
                    style={{
                      borderColor: tailwind.colorMaybe(color)
                    }}
                    className={cn(
                      'border-primary/10 bg-card ring-offset-background dark:bg-primary/20 dark:border-primary-foreground/10 flex size-14 items-center justify-center rounded-full border shadow-sm ring-1 ring-offset-1 transition-all duration-300 ease-in-out group-hover:border-transparent group-hover:shadow-md',
                      {
                        'group-hover:border-core-link/50 dark:group-hover:border-core-link/50 ring-primary/20 dark:ring-primary-foreground/20':
                          !color
                      }
                    )}
                  >
                    <HeroIcon
                      icon={icon as HeroIconName}
                      color={color as TailwindColor}
                      className={cn(
                        'size-7 transition-all duration-300 ease-in-out group-hover:scale-110',
                        {
                          'text-primary/70 dark:text-primary-foreground/80 group-hover:text-core-link':
                            !color
                        }
                      )}
                    />
                  </div>
                )}
                {title && (
                  <CardTitle className="text-secondary-foreground mt-4 text-xl">
                    {title}
                  </CardTitle>
                )}
                {description && (
                  <CardDescription className="text-sm">
                    {description}
                  </CardDescription>
                )}
              </CardHeader>
            )}

            <CardContent>{content}</CardContent>

            {/* Add the link to card footer */}
            {linkDetails && linkDetails.navTrigger === 'link' && (
              <CardFooter>
                <Button
                  variant="link"
                  className="text-secondary-foreground group-hover:text-core-link flex h-auto items-center gap-2 p-0 text-sm transition-all duration-300 hover:cursor-pointer"
                  onClick={() => navigate(linkDetails.url, linkDetails.newTab)}
                >
                  {(linkDetails.newTab && (
                    <ExternalLinkIcon className="h-4 w-4" />
                  )) || <LinkIcon className="h-4 w-4" />}
                  <span>{linkDetails.label}</span>
                </Button>
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
};
