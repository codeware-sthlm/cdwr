// The chart slots the HTML sheets leave for the page to mount a chart in. The charts themselves
// are components/charts.tsx.

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

/** One point of a sparkline: a time in ms and a value */
export type SparkPoint = { at: number; value: number };
