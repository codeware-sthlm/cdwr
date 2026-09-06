import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { cn } from '@codeware/shared/util/ui';

export type StatusBadgeProps = {
  label: string;
  className?: string;
};

/**
 * Brand-tinted status pill (Published / Draft / New / …).
 * One style for all values — the label carries the meaning.
 */
export function StatusBadge({ label, className }: StatusBadgeProps) {
  return (
    <Badge variant="brand" className={cn('shrink-0', className)}>
      {label}
    </Badge>
  );
}
