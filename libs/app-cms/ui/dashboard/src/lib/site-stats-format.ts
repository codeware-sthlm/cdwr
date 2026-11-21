/** Signed whole percentage as text, e.g. `+12%` or `−5%`; null when there is no trend */
export const formatTrend = (
  value: number | null,
  locale: string
): string | null => {
  if (value === null) return null;

  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const percent = new Intl.NumberFormat(locale, { style: 'percent' }).format(
    Math.abs(value) / 100
  );

  return `${sign}${percent}`;
};
