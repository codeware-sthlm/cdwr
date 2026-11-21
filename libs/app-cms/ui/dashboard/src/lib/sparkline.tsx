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
  /** Tint the area under the line, faintly */
  area?: boolean;
  className?: string;
};

/**
 * A series as a thin line, in the surrounding text colour.
 *
 * Stretches to whatever box it is given; the stroke keeps its width.
 */
export function Sparkline({ values, label, area, className }: SparklineProps) {
  const points = sparklinePoints(values);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('h-12 w-full overflow-visible', className)}
    >
      {area && points && (
        <polygon
          points={`0,${SPARKLINE_HEIGHT} ${points} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`}
          fill="currentColor"
          className="opacity-10"
        />
      )}
      <polyline
        points={points}
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
