import { ROLES, SHIP_DAYS } from '../constants';
import { dayLabel, esc, niceCeil, usd } from '../format';
import type { CpuDay, ShippedDay } from '../model';
import type { SpendDay } from '../spend';

// The two day charts as SVG strings. The page measures the element and draws after layout, so
// text stays at its real size at every width; the width is a parameter and nothing here reads the DOM.

export type ChartKind = 'shipped' | 'spend';

/** What the tooltip over a day shows, and where: `top` in px within the chart, `edge` px kept clear at each side */
export type ChartTip = { html: string; top: number; edge: number };

export type Chart = {
  html: string;
  /** The tooltip for the day at this index; null for an index outside the chart */
  tip: (day: number) => ChartTip | null;
};

const CHART_HEIGHT = 200;
const DEFAULT_HEIGHT = 150;

/** The placeholder a sheet leaves for the page to draw into */
export const chartSlot = (kind: ChartKind): string =>
  kind === 'spend'
    ? `<div class="chart" data-chart="spend" data-h="${CHART_HEIGHT}"></div>`
    : `<div class="chart" data-chart data-h="${CHART_HEIGHT}"></div>`;

/** The kind a placeholder's `data-chart` attribute names */
export const chartKind = (attr: string | undefined): ChartKind =>
  attr === 'spend' ? 'spend' : 'shipped';

/** The height a placeholder's `data-h` attribute asks for */
export const chartHeight = (attr: string | undefined): number =>
  Number(attr) || DEFAULT_HEIGHT;

// Both charts share these insets, so "Spend per day" lines up under "Closed by the agent"
const PAD = { l: 38, r: 4, t: 8, b: 20 };

const MIN_WIDTH = 240;

/** The invisible hit area and highlight of a day's column */
const column = (n: number, band: number, plotH: number): string =>
  `<rect class="hit" data-day="${n}" x="${PAD.l + band * n}" y="${PAD.t}" width="${band}" height="${plotH}"/><rect class="hl" x="${PAD.l + band * n}" y="${PAD.t}" width="${band}" height="${plotH}"/>`;

/** A weekly date label under the plot, ending on the last day */
const weekLabel = (
  n: number,
  count: number,
  key: string,
  cx: number,
  height: number
): string =>
  (count - 1 - n) % 7 === 0
    ? `<text class="ax" x="${cx}" y="${height - 5}" text-anchor="middle">${dayLabel(key)}</text>`
    : '';

export const shippedChart = (
  days: readonly ShippedDay[],
  width: number,
  height: number
): Chart => {
  const W = Math.max(MIN_WIDTH, width),
    H = height;
  const padL = PAD.l,
    padR = PAD.r,
    padT = PAD.t,
    padB = PAD.b,
    plotH = H - padT - padB;
  const max = Math.max(2, ...days.map((d) => d.items.length));
  const band = (W - padL - padR) / days.length,
    bw = Math.max(3, Math.min(16, band - 2));
  const y = (v: number): number => padT + plotH - (v / max) * plotH;
  const ticks = max % 2 === 0 ? [0, max / 2, max] : [0, max];
  let g = ticks
    .map(
      (t) =>
        `<line class="${t === 0 ? 'base' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${t}</text>`
    )
    .join('');
  days.forEach((d, n) => {
    const cx = padL + band * n + band / 2,
      x = cx - bw / 2;
    g += column(n, band, plotH);
    const v = d.items.length;
    if (v) {
      const top = y(v),
        h = padT + plotH - top,
        r = Math.min(4, h, bw / 2);
      g += `<path class="barm" d="M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + plotH} Z"/>`;
    }
    g += weekLabel(n, days.length, d.key, cx, H);
  });
  return {
    html: `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Agent tickets closed per day, last ${SHIP_DAYS} days">${g}</svg><div class="tip" hidden></div>`,
    tip: (n) => {
      const d = days[n];
      if (!d) return null;
      const ids = d.items.map((i) => i.id).join(', ');
      return {
        html: `<b>${d.items.length}</b> closed · ${esc(dayLabel(d.key))}${ids ? `<div class="muted">${esc(ids)}</div>` : ''}`,
        top: Math.max(0, y(d.items.length) - 2),
        edge: 60
      };
    }
  };
};

export const spendChart = (
  days: readonly SpendDay[],
  width: number,
  height: number
): Chart => {
  const W = Math.max(MIN_WIDTH, width),
    H = height;
  const plotH = H - PAD.t - PAD.b;
  const max = niceCeil(Math.max(10, ...days.map((d) => d.total)));
  const band = (W - PAD.l - PAD.r) / days.length,
    bw = Math.max(3, Math.min(16, band - 2));
  const y = (v: number): number => PAD.t + plotH - (v / max) * plotH;
  let g = [0, max / 2, max]
    .map(
      (t) =>
        `<line class="${t === 0 ? 'base' : 'grid'}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${PAD.l - 6}" y="${y(t) + 3}" text-anchor="end">${usd(t)}</text>`
    )
    .join('');
  days.forEach((d, n) => {
    const cx = PAD.l + band * n + band / 2,
      x = cx - bw / 2;
    g += column(n, band, plotH);
    // Segments bottom-up in role order, a 2px surface gap between them, the top one rounded
    const segs = ROLES.filter((r) => d[r] > 0);
    let base = PAD.t + plotH;
    segs.forEach((r, k) => {
      const h = (d[r] / max) * plotH,
        gap = k ? 2 : 0;
      const top = base - h,
        hh = h - gap;
      if (hh > 0.5) {
        if (k === segs.length - 1) {
          const rr = Math.min(4, hh, bw / 2),
            b = base - gap;
          g += `<path class="seg-${r}" d="M${x},${b} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${b} Z"/>`;
        } else
          g += `<rect class="seg-${r}" x="${x}" y="${top}" width="${bw}" height="${hh}"/>`;
      }
      base = top;
    });
    g += weekLabel(n, days.length, d.key, cx, H);
  });
  return {
    html: `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="API-equivalent spend per day by role, last ${SHIP_DAYS} days">${g}</svg><div class="tip" hidden></div>`,
    tip: (n) => {
      const d = days[n];
      if (!d) return null;
      return {
        html:
          `<b>${usd(d.total, 2)}</b> · ${esc(dayLabel(d.key))}` +
          ROLES.map(
            (r) =>
              `<div class="muted"><i class="sw seg-${r}"></i>${r} ${usd(d[r], 2)}</div>`
          ).join(''),
        top: Math.max(0, y(d.total) - 2),
        edge: 70
      };
    }
  };
};

// The gauge and sparklines: fixed-size SVG that scales with its box, so nothing is measured

const CPU = { w: 600, h: 56 };

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

/**
 * The NUC's CPU over the day: a band behind the line for each run, the line from the samples
 * and a dot at the peak. Fewer than two samples draw nothing.
 */
export const cpuChart = (day: CpuDay): string => {
  const span = day.to - day.from;
  if (day.points.length < 2 || span <= 0) return '';
  const x = (t: number): string => (((t - day.from) / span) * CPU.w).toFixed(1);
  const y = (cpu: number): string =>
    (CPU.h - 2 - Math.min(cpu, 1) * (CPU.h - 4)).toFixed(1);
  const bands = day.bands
    .map((b) => {
      const w = Math.max(1, ((b.end - b.start) / span) * CPU.w);
      return `<rect class="cpu-band" x="${x(b.start)}" y="0" width="${w.toFixed(1)}" height="${CPU.h}"/>`;
    })
    .join('');
  const line = day.points.map((p) => `${x(p.at)},${y(p.cpu)}`).join(' ');
  const peak = day.peak
    ? `<circle class="cpu-peak" cx="${x(day.peak.at)}" cy="${y(day.peak.cpu)}" r="3"/>`
    : '';
  const label = `NUC CPU over the last 24 hours${day.peak ? `, peak ${Math.round(day.peak.cpu * 100)}%` : ''}, ${day.bands.length} agent runs shaded`;
  return `<svg role="img" aria-label="${esc(label)}" width="100%" height="${CPU.h}" viewBox="0 0 ${CPU.w} ${CPU.h}" preserveAspectRatio="none">${bands}<polyline class="cpu-line" fill="none" vector-effect="non-scaling-stroke" stroke-width="1.5" points="${line}"/>${peak}</svg>`;
};
