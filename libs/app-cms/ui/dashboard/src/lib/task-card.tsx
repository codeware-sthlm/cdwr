import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import { cn } from '@codeware/shared/util/ui';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

import type { IconComponent, LinkComponent } from './types';

export type TaskCardProps = {
  href: string;
  label: string;
  description: string;
  icon: IconComponent;
  linkComponent?: LinkComponent;
  className?: string;
};

/** Primary "what would you like to do?" shortcut card. */
export function TaskCard({
  href,
  label,
  description,
  icon: Icon,
  linkComponent: LinkComp = 'a',
  className
}: TaskCardProps) {
  return (
    <LinkComp
      href={href}
      className={cn(
        'group ring-offset-background focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className
      )}
    >
      <Card variant="bordered" interactive className="h-full gap-0 py-0">
        <CardContent className="flex h-full items-center gap-3.5 p-4.5">
          <div className="bg-brand-600 flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Icon className="size-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-semibold">{label}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
              {description}
            </p>
          </div>
          <ArrowRightIcon
            className="text-muted-foreground size-4 shrink-0 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-(--link)"
            aria-hidden
          />
        </CardContent>
      </Card>
    </LinkComp>
  );
}
