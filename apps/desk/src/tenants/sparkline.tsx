// A tiny line of the days' values; no axis, the figures sit beside it

const W = 120;
const H = 28;
const PAD = 3;

/** The polyline points of `values`, oldest first, scaled to the box; empty below two values */
export const sparkPoints = (values: readonly number[]): string => {
  if (values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = PAD + (i * (W - 2 * PAD)) / (values.length - 1);
      // A flat series sits mid-height
      const y =
        max === min ? H / 2 : H - PAD - ((v - min) * (H - 2 * PAD)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export const Sparkline = ({
  values,
  label
}: {
  values: readonly number[];
  label: string;
}) => {
  const points = sparkPoints(values);
  if (!points) return null;
  return (
    <svg
      className="tn-spark text-[color:var(--accent)]"
      role="img"
      aria-label={label}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
