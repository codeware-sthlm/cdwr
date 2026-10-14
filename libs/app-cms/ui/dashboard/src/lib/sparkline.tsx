import { cn } from '@codeware/shared/util/ui';

import {
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklinePoints
} from './sparkline-points';

export type SparklineProps = {
  values: readonly number[];
  /** Read by assistive tech in place of the drawing */
  label: string;
  className?: string;
};

/**
 * A series as a thin line, in the surrounding text colour.
 *
 * Stretches to whatever box it is given; the stroke keeps its width.
 */
export function Sparkline({ values, label, className }: SparklineProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('h-12 w-full overflow-visible', className)}
    >
      <polyline
        points={sparklinePoints(values)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
