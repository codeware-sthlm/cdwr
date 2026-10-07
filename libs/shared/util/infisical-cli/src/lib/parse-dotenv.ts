const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\.)*)"/;
const SINGLE_QUOTED = /^'([^']*)'/;

const parseValue = (raw: string): string => {
  const rest = raw.trimStart();

  const double = DOUBLE_QUOTED.exec(rest);
  if (double?.[1] !== undefined) {
    try {
      const parsed: unknown = JSON.parse(`"${double[1]}"`);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // An escape JSON does not know stays as written
    }
    return double[1];
  }

  const single = SINGLE_QUOTED.exec(rest);
  if (single?.[1] !== undefined) return single[1];

  return rest.replace(/\s+#.*$/, '').trim();
};

/**
 * A minimal dotenv parser, enough for the committed `.env` files and the
 * offline cache. Double-quoted values follow JSON escapes, single-quoted are
 * literal, and only unquoted values lose a trailing ` # comment`.
 */
export const parseDotenv = (text: string): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = LINE.exec(line);
    if (match?.[1] === undefined) continue;
    values[match[1]] = parseValue(match[2] ?? '');
  }
  return values;
};
