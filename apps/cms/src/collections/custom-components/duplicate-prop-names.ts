const rowName = (row: unknown): string | null => {
  if (typeof row !== 'object' || row === null || !('name' in row)) {
    return null;
  }
  return typeof row.name === 'string' && row.name !== '' ? row.name : null;
};

/**
 * The names used by more than one row, each listed once in order of
 * appearance. Takes the raw field value, which is untyped.
 */
export const duplicatePropNames = (rows: unknown): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of Array.isArray(rows) ? rows.map(rowName) : []) {
    if (name === null) {
      continue;
    }
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  return [...repeated];
};
