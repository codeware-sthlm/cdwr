import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { PlusIcon } from '@heroicons/react/24/outline';

import type { IconComponent, LinkComponent } from './types';

export type CollectionCardProps = {
  /** Collection list view. The whole card navigates here. */
  href: string;
  /**
   * Create view for the collection ("New" button). Omit to hide the button —
   * e.g. when the user can't create, or for global (single-doc) collections.
   */
  createHref?: string;
  label: string;
  description?: string;
  /** Footer info, e.g. `12 items` or `Open to edit`. */
  countLabel: string;
  /** Localized "New" button text. Only rendered alongside `createHref`. */
  newLabel?: string;
  icon: IconComponent;
  linkComponent?: LinkComponent;
};

/**
 * Collection overview card. Uses the stretched-link pattern: the title link
 * covers the whole card (no nested anchors) while the "New" button stays
 * independently clickable above it via `z-10`.
 */
export function CollectionCard({
  href,
  createHref,
  label,
  description,
  countLabel,
  newLabel,
  icon: Icon,
  linkComponent: LinkComp = 'a'
}: CollectionCardProps) {
  return (
    <Card variant="bordered" interactive className="relative h-full gap-3 py-4">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="bg-accent flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-5 text-(--link)" aria-hidden />
        </div>
        <CardTitle className="text-sm leading-snug font-semibold">
          <LinkComp
            href={href}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {label}
          </LinkComp>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {description && (
          <p className="text-muted-foreground text-xs leading-normal">
            {description}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between py-3">
        <span className="text-muted-foreground text-xs">{countLabel}</span>
        {createHref && (
          <Button
            asChild
            size="sm"
            className="bg-brand-600 hover:bg-brand-700 relative z-10 text-white"
          >
            <LinkComp href={createHref}>
              <PlusIcon aria-hidden />
              {newLabel}
            </LinkComp>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
