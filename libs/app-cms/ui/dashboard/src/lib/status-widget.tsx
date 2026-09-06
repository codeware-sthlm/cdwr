import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import { cn } from '@codeware/shared/util/ui';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

import type { IconComponent } from './types';

/** How a widget's subject is doing, worst-wins across everything it covers */
export type StatusTone = 'ok' | 'warning' | 'error' | 'neutral';

export type StatusWidgetProps = {
  icon: IconComponent;
  tone: StatusTone;
  /** What the widget covers, e.g. "Domains & certificates" */
  title: string;
  /** The headline value, e.g. "8 domains" */
  metric: string;
  /** One line naming the worst finding, e.g. "2 pending" */
  detail: string;
  /** Opens the detail sheet; omit for a widget with nothing more to show */
  onOpen?: () => void;
  /** Accessible name for the open affordance, e.g. "Show all domains" */
  openLabel?: string;
  className?: string;
};

/**
 * Tone drives the icon only — never the card.
 *
 * A grid of widgets whose surfaces are tinted reads as a traffic light, where
 * every card competes for the same attention. Keeping the card neutral leaves
 * exactly one thing coloured per widget, which is what makes the one amber
 * icon in a row of green ones findable at a glance.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  ok: 'text-(--success-subtle) bg-(--success-subtle)/10',
  warning: 'text-(--warning-subtle) bg-(--warning-subtle)/10',
  error: 'text-(--destructive-subtle) bg-destructive/10',
  neutral: 'text-muted-foreground bg-muted'
};

/**
 * One subject's health, as a dashboard tile.
 *
 * Built for the answer being "everything is fine" almost every time: the icon
 * carries the verdict, so a healthy panel is read rather than scanned, and the
 * detail line only has to be legible when it says something.
 *
 * Presentational and hook-free — every label arrives translated and every
 * value pre-formatted, so the same widget renders in the admin and in
 * Storybook.
 */
export function StatusWidget({
  icon: Icon,
  tone,
  title,
  metric,
  detail,
  onOpen,
  openLabel,
  className
}: StatusWidgetProps) {
  const interactive = Boolean(onOpen);

  const body = (
    <Card
      variant="bordered"
      interactive={interactive}
      className="h-full gap-0 py-0"
    >
      <CardContent className="flex h-full items-center gap-3.5 p-4.5">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            TONE_CLASSES[tone]
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium">{title}</p>
          <p className="text-foreground text-sm font-semibold">{metric}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
            {detail}
          </p>
        </div>
        {interactive && (
          <ArrowRightIcon
            className="text-muted-foreground size-4 shrink-0 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-(--link)"
            aria-hidden
          />
        )}
      </CardContent>
    </Card>
  );

  // `h-full` on both wrappers, not just the card: the grid stretches these,
  // and without it the card's own `h-full` resolves against a box that has
  // already shrunk to its content — leaving widgets in a row uneven
  if (!interactive) {
    return <div className={cn('h-full', className)}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      className={cn(
        'group ring-offset-background focus-visible:ring-ring block h-full w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className
      )}
    >
      {body}
    </button>
  );
}
