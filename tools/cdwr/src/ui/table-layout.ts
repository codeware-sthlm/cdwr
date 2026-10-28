import { plain } from './theme';

const LAST_MIN = 20;
const FIXED_FLOOR = 8;

const visibleLength = (text: string): number => plain(text).length;

/** Column widths for a cli-table3 table that must fit in `width` terminal columns */
export function tableLayout(
  head: readonly string[],
  rows: readonly (readonly string[])[],
  width: number
): number[] {
  const natural = head.map((h, i) =>
    Math.max(
      1,
      visibleLength(h),
      ...rows.map((row) => visibleLength(row[i] ?? ''))
    )
  );
  const lastIndex = natural.length - 1;
  const lastNatural = natural[lastIndex];
  if (lastNatural === undefined) return [];
  const reserve = Math.min(LAST_MIN, lastNatural);

  // `| ` and ` |` borders: 3 characters per column plus 1
  const budget = width - (3 * natural.length + 1);
  const fixed = natural.slice(0, lastIndex);
  const sum = () => fixed.reduce((a, b) => a + b, 0);

  while (sum() > budget - reserve) {
    const widest = Math.max(...fixed);
    if (widest <= FIXED_FLOOR) break;
    fixed[fixed.indexOf(widest)] = widest - 1;
  }

  const remainder = Math.max(reserve, budget - sum());
  return [...fixed, Math.min(lastNatural, remainder)];
}

/** Output width: the terminal's columns, else `COLUMNS`, else `fallback` */
export function outputWidth(
  fallback: number,
  stdout: { columns?: number } = process.stdout,
  env: Record<string, string | undefined> = process.env
): number {
  if (stdout.columns !== undefined && stdout.columns > 0) return stdout.columns;
  const fromEnv = Number(env['COLUMNS']);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : fallback;
}
