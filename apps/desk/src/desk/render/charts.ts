import { esc } from '../format';

// The chart slots the HTML sheets leave for the page to mount a chart in, and the gauge and
// sparklines those sheets still write as strings. The charts themselves are components/charts.tsx.

export type ChartKind = 'shipped' | 'spend';

const CHART_HEIGHT = 200;
const DEFAULT_HEIGHT = 150;

/** The placeholder a sheet leaves for the page to mount a chart in */
export const chartSlot = (kind: ChartKind): string =>
  kind === 'spend'
    ? `<div class="chart-slot" data-chart="spend" data-h="${CHART_HEIGHT}"></div>`
    : `<div class="chart-slot" data-chart data-h="${CHART_HEIGHT}"></div>`;

/** The kind a placeholder's `data-chart` attribute names */
export const chartKind = (attr: string | undefined): ChartKind =>
  attr === 'spend' ? 'spend' : 'shipped';

/** The height a placeholder's `data-h` attribute asks for */
export const chartHeight = (attr: string | undefined): number =>
  Number(attr) || DEFAULT_HEIGHT;

// The gauge and sparklines: fixed-size SVG that scales with its box, so nothing is measured

const GAUGE = { w: 100, h: 8 };
const SPARK = { w: 240, h: 40 };

/** A bar filled to `share` of the track, in the warning colour when `bad` */
export const gauge = (share: number, bad: boolean): string =>
  `<svg class="gauge" viewBox="0 0 ${GAUGE.w} ${GAUGE.h}" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="${GAUGE.w}" height="${GAUGE.h}" rx="4"/><rect class="fill${bad ? ' bad' : ''}" width="${Math.max(0, Math.min(1, share)) * GAUGE.w}" height="${GAUGE.h}" rx="4"/></svg>`;

/** One point of a sparkline: a time in ms and a value */
export type SparkPoint = { at: number; value: number };

/**
 * A line over `from`..`to` (ms), scaled so `max` is the top; a dashed line marks `limit`.
 * Fewer than two points leave only the limit.
 */
export const sparkline = (
  points: readonly SparkPoint[],
  from: number,
  to: number,
  max: number,
  limit: number | null,
  label: string
): string => {
  const x = (t: number): number => ((t - from) / (to - from)) * SPARK.w;
  const y = (v: number): number =>
    SPARK.h - Math.min(1, Math.max(0, v / max)) * SPARK.h;
  const line =
    points.length > 1
      ? `<polyline class="line" points="${points.map((p) => `${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`
      : '';
  const mark =
    limit === null
      ? ''
      : `<line class="limit" x1="0" x2="${SPARK.w}" y1="${y(limit)}" y2="${y(limit)}"/>`;
  return `<svg class="spark" viewBox="0 0 ${SPARK.w} ${SPARK.h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${mark}${line}</svg>`;
};
