/** Prettier's options as the repo's `.prettierrc` sets them, minus the tailwind plugin */
export const PRETTIER_OPTIONS = {
  parser: 'typescript',
  singleQuote: true,
  trailingComma: 'none'
} as const;

export type FormatResult =
  | { status: 'formatted'; text: string; cursorOffset: number }
  | { status: 'unchanged' }
  | {
      status: 'error';
      message: string;
      line: number | null;
      column: number | null;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const numberAt = (value: unknown, key: string): number | null => {
  const found = isRecord(value) ? value[key] : undefined;
  return typeof found === 'number' ? found : null;
};

/** Prettier's syntax errors carry `loc.start`; the message adds a code frame */
export const readFormatError = (error: unknown): FormatResult => {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split('\n')[0] ?? raw;
  const loc = isRecord(error) ? error['loc'] : undefined;
  const start = isRecord(loc) ? loc['start'] : undefined;

  return {
    status: 'error',
    message:
      firstLine.replace(/\s*\(\d+:\d+\)\s*$/, '').trim() || 'Syntax error',
    line: numberAt(start, 'line'),
    column: numberAt(start, 'column')
  };
};

/**
 * Formats TSX with Prettier, loaded on first use so the formatter stays out
 * of the page's initial bundle. Never throws: a syntax error is a result.
 */
export const formatSource = async (
  source: string,
  cursorOffset = 0
): Promise<FormatResult> => {
  try {
    const [prettier, typescript, estree] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/typescript'),
      import('prettier/plugins/estree')
    ]);
    const { formatted, cursorOffset: next } = await prettier.formatWithCursor(
      source,
      {
        ...PRETTIER_OPTIONS,
        // The estree printer is a plugin of its own in the standalone build
        plugins: [typescript, estree],
        cursorOffset
      }
    );
    return formatted === source
      ? { status: 'unchanged' }
      : { status: 'formatted', text: formatted, cursorOffset: next };
  } catch (error) {
    return readFormatError(error);
  }
};
