/**
 * The Moon workspace's custom component, written as an editor would in the
 * component studio. `@site/ui` is what the build resolves the site's own
 * primitives from.
 */

/** A number, its change against the one before, and a small area chart */
export const moonMetricCardSource = `import { useId, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn
} from '@site/ui';

type Props = {
  /** What the number is */
  title: string;
  /** One line under the title */
  description?: string;
  /** Comma or newline separated numbers, oldest first */
  values: string;
  /** Shown after the number, such as "%" or " kr" */
  unit?: string;
  /** Decimals in the shown numbers */
  decimals?: number;
  /** Draw the chart under the number */
  showChart?: boolean;
};

const parseValues = (raw: string): number[] =>
  raw
    .split(/[,\\n;]+/)
    .map((part) => part.replace(/\\s/g, ''))
    .filter((part) => part !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));

// Intl takes a whole number of decimals between 0 and 20
const format = (n: number, decimals: number) => {
  const digits = Math.min(20, Math.max(0, Math.trunc(decimals) || 0));
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
};

export default function MetricCard({
  title,
  description,
  values,
  unit = '',
  decimals = 0,
  showChart = true
}: Props) {
  const series = useMemo(() => parseValues(values), [values]);
  const gradientId = useId();

  if (series.length === 0) {
    return (
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>No values yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const change =
    previous === null || previous === 0
      ? null
      : ((latest - previous) / Math.abs(previous)) * 100;
  const direction =
    change === null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const Trend =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const data = series.map((value, index) => ({ index, value }));

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-3xl tabular-nums">
          {format(latest, decimals)}
          {unit && (
            <span className="text-muted-foreground text-base font-normal">
              {unit}
            </span>
          )}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'gap-1',
              direction === 'up' && 'text-(--success-subtle)',
              direction === 'down' && 'text-(--destructive-subtle)'
            )}
          >
            <Trend className="size-3.5" />
            {change === null
              ? 'First value'
              : \`\${change > 0 ? '+' : ''}\${format(change, 1)} %\`}
          </Badge>
          {previous !== null && (
            <span className="text-muted-foreground text-sm">
              from {format(previous, decimals)}
              {unit}
            </span>
          )}
        </div>

        {showChart && series.length > 1 && (
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--primary)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-popover text-popover-foreground rounded-md border px-2 py-1 text-xs shadow-sm">
                        {format(Number(payload[0].value), decimals)}
                        {unit}
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill={\`url(#\${gradientId})\`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
`;
