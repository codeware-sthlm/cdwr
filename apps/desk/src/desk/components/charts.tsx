import { type ReactNode, useEffect, useState } from 'react';

import { ROLES, SHIP_DAYS } from '../constants';
import { dayLabel, niceCeil, usd } from '../format';
import type { CpuDay as CpuDayData, ShippedDay } from '../model';
import type { SpendDay } from '../spend';

// The two day charts and the CPU line as SVG components. A day chart measures its own box, so text
// stays at its real size at every width; the geometry is plain functions that read no DOM.

// Both day charts share these insets, so "Spend per day" lines up under "Closed by the agent"
const PAD = { l: 38, r: 4, t: 8, b: 20 };

const MIN_WIDTH = 240;

/** The plot of a day chart at a width: its viewBox, the band per day and the value scale */
export type Frame = {
  W: number;
  H: number;
  plotH: number;
  /** The baseline's y */
  bottom: number;
  band: number;
  /** A bar's width */
  bw: number;
  y: (v: number) => number;
};

export const frame = (
  count: number,
  width: number,
  height: number,
  max: number
): Frame => {
  const W = Math.max(MIN_WIDTH, width),
    plotH = height - PAD.t - PAD.b;
  const band = (W - PAD.l - PAD.r) / count;
  return {
    W,
    H: height,
    plotH,
    bottom: PAD.t + plotH,
    band,
    bw: Math.max(3, Math.min(16, band - 2)),
    y: (v) => PAD.t + plotH - (v / max) * plotH
  };
};

/** The centre of day `n`'s column, in viewBox units */
export const centre = (f: Frame, n: number): number =>
  PAD.l + f.band * n + f.band / 2;

/** A bar from `bottom` up to `top` with its top corners rounded */
export const barPath = (
  x: number,
  bw: number,
  top: number,
  bottom: number
): string => {
  const r = Math.min(4, bottom - top, bw / 2);
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${bottom} Z`;
};

/** The closed chart's top: at least two, so one ticket doesn't fill the plot */
export const shippedMax = (days: readonly ShippedDay[]): number =>
  Math.max(2, ...days.map((d) => d.items.length));

/** The value lines: the middle one only where it falls on a whole ticket */
export const shippedTicks = (max: number): number[] =>
  max % 2 === 0 ? [0, max / 2, max] : [0, max];

/** The spend chart's top: a round number, at least $10 */
export const spendMax = (days: readonly SpendDay[]): number =>
  niceCeil(Math.max(10, ...days.map((d) => d.total)));

export type Segment = {
  role: (typeof ROLES)[number];
  top: number;
  bottom: number;
  /** The top segment, drawn with rounded corners */
  last: boolean;
};

/** A day's spend bottom-up in role order, a 2px surface gap between segments; slivers are left out */
export const segments = (d: SpendDay, f: Frame, max: number): Segment[] => {
  const roles = ROLES.filter((r) => d[r] > 0);
  const out: Segment[] = [];
  let base = f.bottom;
  roles.forEach((role, k) => {
    const h = (d[role] / max) * f.plotH,
      gap = k ? 2 : 0;
    const top = base - h;
    if (h - gap > 0.5)
      out.push({
        role,
        top,
        bottom: base - gap,
        last: k === roles.length - 1
      });
    base = top;
  });
  return out;
};

/** Where the tooltip over day `n` sits in a box `width` px wide: centred on the column, `edge` px clear of each side */
export const tipLeft = (
  f: Frame,
  n: number,
  width: number,
  edge: number
): number => {
  const scale = width > 0 ? width / f.W : 1;
  const box = width > 0 ? width : f.W;
  return Math.min(box - edge, Math.max(edge, centre(f, n) * scale));
};

/**
 * The width of the element the returned callback ref is set on, kept current by a
 * `ResizeObserver`; null before it mounts. Without `ResizeObserver` it keeps its mount width.
 */
export const useWidth = (): [
  (el: HTMLElement | null) => void,
  number | null
] => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [observed, setObserved] = useState<number | null>(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setObserved(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, el ? (observed ?? el.clientWidth) : null];
};

type Tip = { content: ReactNode; value: number };

type DayChartProps = {
  keys: readonly string[];
  height: number;
  max: number;
  ticks: readonly number[];
  tickLabel: (t: number) => string;
  label: string;
  /** Px kept clear of each side by the tooltip */
  edge: number;
  bars: (n: number, f: Frame, x: number) => ReactNode;
  tip: (n: number) => Tip;
};

/** A weekly date label under the plot, ending on the last day */
const WeekLabel = ({
  n,
  count,
  dayKey,
  cx,
  height
}: {
  n: number;
  count: number;
  dayKey: string;
  cx: number;
  height: number;
}) =>
  (count - 1 - n) % 7 === 0 ? (
    <text className="ax" x={cx} y={height - 5} textAnchor="middle">
      {dayLabel(dayKey)}
    </text>
  ) : null;

const DayChart = ({
  keys,
  height,
  max,
  ticks,
  tickLabel,
  label,
  edge,
  bars,
  tip
}: DayChartProps) => {
  const [ref, width] = useWidth();
  const [day, setDay] = useState<number | null>(null);
  const f = width === null ? null : frame(keys.length, width, height, max);
  const shown = f && day !== null && day < keys.length ? tip(day) : null;
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setDay(null)}>
      {f ? (
        <svg
          viewBox={`0 0 ${f.W} ${f.H}`}
          height={f.H}
          role="img"
          aria-label={label}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={t === 0 ? 'base' : 'grid'}
                x1={PAD.l}
                x2={f.W - PAD.r}
                y1={f.y(t)}
                y2={f.y(t)}
              />
              <text
                className="ax"
                x={PAD.l - 6}
                y={f.y(t) + 3}
                textAnchor="end"
              >
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {keys.map((key, n) => {
            const cx = centre(f, n);
            const x0 = PAD.l + f.band * n;
            return (
              <g key={key}>
                <rect
                  className="hit"
                  data-day={n}
                  x={x0}
                  y={PAD.t}
                  width={f.band}
                  height={f.plotH}
                  onMouseEnter={() => setDay(n)}
                />
                <rect
                  className={day === n ? 'hl on' : 'hl'}
                  x={x0}
                  y={PAD.t}
                  width={f.band}
                  height={f.plotH}
                />
                {bars(n, f, cx - f.bw / 2)}
                <WeekLabel
                  n={n}
                  count={keys.length}
                  dayKey={key}
                  cx={cx}
                  height={f.H}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {f && shown && day !== null ? (
        <div
          className="tip"
          style={{
            left: tipLeft(f, day, width ?? 0, edge),
            top: Math.max(0, f.y(shown.value) - 2)
          }}
        >
          {shown.content}
        </div>
      ) : null}
    </div>
  );
};

/** Agent tickets closed per day, with the ids of a day's tickets in its tooltip */
export const ShippedChart = ({
  days,
  height
}: {
  days: readonly ShippedDay[];
  height: number;
}) => {
  const max = shippedMax(days);
  return (
    <DayChart
      keys={days.map((d) => d.key)}
      height={height}
      max={max}
      ticks={shippedTicks(max)}
      tickLabel={String}
      label={`Agent tickets closed per day, last ${SHIP_DAYS} days`}
      edge={60}
      bars={(n, f, x) => {
        const v = days[n].items.length;
        return v ? (
          <path className="barm" d={barPath(x, f.bw, f.y(v), f.bottom)} />
        ) : null;
      }}
      tip={(n) => {
        const d = days[n];
        const ids = d.items.map((i) => i.id).join(', ');
        return {
          value: d.items.length,
          content: (
            <>
              <b>{d.items.length}</b> closed · {dayLabel(d.key)}
              {ids ? <div className="muted">{ids}</div> : null}
            </>
          )
        };
      }}
    />
  );
};

/** API-equivalent spend per day, stacked by role, with each role's amount in the tooltip */
export const SpendChart = ({
  days,
  height
}: {
  days: readonly SpendDay[];
  height: number;
}) => {
  const max = spendMax(days);
  return (
    <DayChart
      keys={days.map((d) => d.key)}
      height={height}
      max={max}
      ticks={[0, max / 2, max]}
      tickLabel={(t) => usd(t)}
      label={`API-equivalent spend per day by role, last ${SHIP_DAYS} days`}
      edge={70}
      bars={(n, f, x) =>
        segments(days[n], f, max).map((s) =>
          s.last ? (
            <path
              key={s.role}
              className={`seg-${s.role}`}
              d={barPath(x, f.bw, s.top, s.bottom)}
            />
          ) : (
            <rect
              key={s.role}
              className={`seg-${s.role}`}
              x={x}
              y={s.top}
              width={f.bw}
              height={s.bottom - s.top}
            />
          )
        )
      }
      tip={(n) => {
        const d = days[n];
        return {
          value: d.total,
          content: (
            <>
              <b>{usd(d.total, 2)}</b> · {dayLabel(d.key)}
              {ROLES.map((r) => (
                <div key={r} className="muted">
                  <i className={`sw seg-${r}`}></i>
                  {r} {usd(d[r], 2)}
                </div>
              ))}
            </>
          )
        };
      }}
    />
  );
};

// The gauge and sparklines: fixed-size SVG that scales with its box, so nothing is measured
const GAUGE = { w: 100, h: 8 };
const SPARK = { w: 240, h: 40 };

/** One point of a sparkline: a time in ms and a value */
export type SparkPoint = { at: number; value: number };

/** A bar filled to `share` of the track, in the warning colour when `bad` */
export const Gauge = ({ share, bad }: { share: number; bad: boolean }) => (
  <svg
    className="gauge"
    viewBox={`0 0 ${GAUGE.w} ${GAUGE.h}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <rect className="track" width={GAUGE.w} height={GAUGE.h} rx="4" />
    <rect
      className={bad ? 'fill bad' : 'fill'}
      width={Math.max(0, Math.min(1, share)) * GAUGE.w}
      height={GAUGE.h}
      rx="4"
    />
  </svg>
);

/**
 * A line over `from`..`to` (ms), scaled so `max` is the top; a dashed line marks `limit`.
 * Fewer than two points leave only the limit.
 */
export const Sparkline = ({
  points,
  from,
  to,
  max,
  limit,
  label
}: {
  points: readonly SparkPoint[];
  from: number;
  to: number;
  max: number;
  limit: number | null;
  label: string;
}) => {
  const x = (t: number): number => ((t - from) / (to - from)) * SPARK.w;
  const y = (v: number): number =>
    SPARK.h - Math.min(1, Math.max(0, v / max)) * SPARK.h;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${SPARK.w} ${SPARK.h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {limit === null ? null : (
        <line
          className="limit"
          x1="0"
          x2={SPARK.w}
          y1={y(limit)}
          y2={y(limit)}
        />
      )}
      {points.length > 1 ? (
        <polyline
          className="line"
          points={points
            .map((p) => `${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`)
            .join(' ')}
        />
      ) : null}
    </svg>
  );
};

// The CPU line: a fixed-size SVG that scales with its box, so nothing is measured
const CPU = { w: 600, h: 56 };

/**
 * The NUC's CPU over the day: a band behind the line for each run, the line from the samples
 * and a dot at the peak. Fewer than two samples draw nothing.
 */
export const CpuChart = ({ day }: { day: CpuDayData }) => {
  const span = day.to - day.from;
  if (day.points.length < 2 || span <= 0) return null;
  const x = (t: number): string => (((t - day.from) / span) * CPU.w).toFixed(1);
  const y = (cpu: number): string =>
    (CPU.h - 2 - Math.min(cpu, 1) * (CPU.h - 4)).toFixed(1);
  const label = `NUC CPU over the last 24 hours${day.peak ? `, peak ${Math.round(day.peak.cpu * 100)}%` : ''}, ${day.bands.length} agent runs shaded`;
  return (
    <svg
      role="img"
      aria-label={label}
      width="100%"
      height={CPU.h}
      viewBox={`0 0 ${CPU.w} ${CPU.h}`}
      preserveAspectRatio="none"
    >
      {day.bands.map((b) => (
        <rect
          key={`${b.start}-${b.end}`}
          className="cpu-band"
          x={x(b.start)}
          y="0"
          width={Math.max(1, ((b.end - b.start) / span) * CPU.w).toFixed(1)}
          height={CPU.h}
        />
      ))}
      <polyline
        className="cpu-line"
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth="1.5"
        points={day.points.map((p) => `${x(p.at)},${y(p.cpu)}`).join(' ')}
      />
      {day.peak ? (
        <circle
          className="cpu-peak"
          cx={x(day.peak.at)}
          cy={y(day.peak.cpu)}
          r="3"
        />
      ) : null}
    </svg>
  );
};
