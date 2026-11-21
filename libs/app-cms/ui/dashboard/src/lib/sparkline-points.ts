export const SPARKLINE_WIDTH = 100;
export const SPARKLINE_HEIGHT = 30;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Polyline points for a series scaled to the box, from zero up to the series
 * maximum, so an all-zero series is a flat line along the bottom.
 *
 * A single value is drawn as a flat line across the box.
 */
export const sparklinePoints = (
  values: readonly number[],
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT
): string => {
  if (values.length === 0) return '';

  const series = values.length === 1 ? [values[0], values[0]] : values;
  const max = Math.max(...series, 0);
  const step = width / (series.length - 1);

  return series
    .map((value, index) => {
      const y =
        max === 0 ? height : height - (Math.max(value, 0) / max) * height;
      return `${round(index * step)},${round(y)}`;
    })
    .join(' ');
};
