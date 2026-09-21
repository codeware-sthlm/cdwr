/** How many links of a `cause` chain are worth printing before it is noise. */
const MAX_DEPTH = 5;

/** Postgres puts the useful part on fields rather than in the message. */
const DETAIL_FIELDS = ['code', 'detail', 'hint', 'constraint'] as const;

/**
 * An error and everything beneath its `cause`, as lines to print.
 *
 * Drizzle wraps the driver's error, so a failing migration surfaces as
 * `Failed query: create table …` while the reason — no space left on the
 * device, a read-only transaction, the constraint that was violated — sits in
 * `cause` and never reaches the log. A CI log then contains everything except
 * the answer, which is worse than a short one.
 *
 * Returns lines rather than printing them, so a caller that writes
 * synchronously to a file descriptor keeps doing that, and so this is testable
 * where a script ending in `process.exit` is not.
 *
 * @param error - Whatever was thrown
 * @returns One line per stack, plus a line per detail field that carries a value
 */
export function describeError(error: unknown): Array<string> {
  const lines: Array<string> = [];
  // A cause chain can point back at itself, and depth alone would not catch it
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;

  while (current !== null && current !== undefined && depth < MAX_DEPTH) {
    if (seen.has(current)) {
      lines.push('caused by: (already shown above)');
      return lines;
    }
    seen.add(current);

    if (!(current instanceof Error)) {
      lines.push(
        depth === 0 ? String(current) : `caused by: ${String(current)}`
      );
      return lines;
    }

    const described = current.stack ?? `${current.name}: ${current.message}`;
    lines.push(depth === 0 ? described : `caused by: ${described}`);

    const fields = current as Error & Record<string, unknown>;
    for (const field of DETAIL_FIELDS) {
      const value = fields[field];
      if (typeof value === 'string' && value.length > 0) {
        lines.push(`  ${field}: ${value}`);
      }
    }

    current = current.cause;
    depth += 1;
  }

  // Say so rather than letting a truncated chain read as the whole story
  if (current !== null && current !== undefined) {
    lines.push('caused by: (further causes not shown)');
  }

  return lines;
}
