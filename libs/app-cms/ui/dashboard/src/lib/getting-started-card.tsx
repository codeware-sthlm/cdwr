import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { cn } from '@codeware/shared/util/ui';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

import type { LinkComponent } from './types';

export type GettingStartedStep = {
  href: string;
  label: string;
  done: boolean;
};

export type GettingStartedCardProps = {
  title: string;
  subtitle: string;
  /** Accessible label for the dismiss button. */
  dismissLabel: string;
  steps: GettingStartedStep[];
  onDismiss: () => void;
  linkComponent?: LinkComponent;
  className?: string;
};

/**
 * Dismissible onboarding checklist for first-time editors.
 *
 * Steps link to real screens and are ticked off by the host based on
 * live data — the card itself is purely presentational.
 */
export function GettingStartedCard({
  title,
  subtitle,
  dismissLabel,
  steps,
  onDismiss,
  linkComponent: LinkComp = 'a',
  className
}: GettingStartedCardProps) {
  return (
    <Card variant="bordered" className={cn('gap-4', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            title={dismissLabel}
            aria-label={dismissLabel}
          >
            <XMarkIcon className="size-4" aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {steps.map((step) => (
            <li key={step.href}>
              {step.done ? (
                <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <CheckCircleIcon
                    className="size-5 shrink-0 text-(--link)"
                    aria-hidden
                  />
                  <span className="text-muted-foreground text-sm line-through">
                    {step.label}
                  </span>
                </div>
              ) : (
                <LinkComp
                  href={step.href}
                  className="group hover:bg-accent focus-visible:ring-ring flex items-center gap-3 rounded-lg px-2 py-1.5 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    className="border-border size-5 shrink-0 rounded-full border-2"
                    aria-hidden
                  />
                  <span className="text-foreground text-sm font-medium">
                    {step.label}
                  </span>
                  <ArrowRightIcon
                    className="text-muted-foreground ml-auto size-4 shrink-0 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-(--link)"
                    aria-hidden
                  />
                </LinkComp>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
