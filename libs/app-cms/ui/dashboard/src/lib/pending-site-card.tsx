import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { cn } from '@codeware/shared/util/ui';
import { ClockIcon } from '@heroicons/react/24/outline';

export type PendingSitePoint = {
  label: string;
  text: string;
};

export type PendingSiteCardProps = {
  title: string;
  /** What is happening, what comes next and what to do meanwhile. */
  points: PendingSitePoint[];
  className?: string;
};

/**
 * Tells a new editor their site is not live yet.
 *
 * Purely presentational: the host decides when to show it and supplies the
 * translated copy.
 */
export function PendingSiteCard({
  title,
  points,
  className
}: PendingSiteCardProps) {
  return (
    <Card variant="bordered" className={cn('gap-4', className)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ClockIcon className="size-5 shrink-0 text-(--link)" aria-hidden />
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {points.map((point) => (
            <li key={point.label}>
              <CardDescription className="text-foreground font-medium">
                {point.label}
              </CardDescription>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {point.text}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
