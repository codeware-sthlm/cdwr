import type {
  ComponentDiagnostic,
  ComponentProp,
  ComponentPropKind
} from '@codeware/shared/util/payload-utils';

export type CheckResult = {
  ok: boolean;
  diagnostics: ComponentDiagnostic[];
  /** Undefined when the code's props could not be resolved */
  props?: ComponentProp[];
};

export type CheckOutcome =
  | { status: 'done'; result: CheckResult }
  | { status: 'forbidden' }
  | { status: 'failed' };

const propKinds = {
  string: true,
  number: true,
  boolean: true,
  other: true
} as const satisfies Record<ComponentPropKind, true>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDiagnostic = (value: unknown): value is ComponentDiagnostic =>
  isRecord(value) &&
  typeof value['message'] === 'string' &&
  typeof value['line'] === 'number' &&
  typeof value['column'] === 'number' &&
  (value['severity'] === 'error' || value['severity'] === 'warning');

const isPropKind = (value: unknown): value is ComponentPropKind =>
  typeof value === 'string' && Object.hasOwn(propKinds, value);

const isProp = (value: unknown): value is ComponentProp =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  isPropKind(value['kind']) &&
  typeof value['optional'] === 'boolean';

/** Reads the endpoint's answer; null when it is not one. */
export const parseCheckResult = (value: unknown): CheckResult | null => {
  if (
    !isRecord(value) ||
    typeof value['ok'] !== 'boolean' ||
    !Array.isArray(value['diagnostics'])
  ) {
    return null;
  }
  const diagnostics = value['diagnostics'].filter(isDiagnostic);
  const props = Array.isArray(value['props'])
    ? value['props'].filter(isProp)
    : undefined;
  return { ok: value['ok'], diagnostics, ...(props ? { props } : {}) };
};

type RequestArgs = {
  /** The api route, relative to the admin's origin */
  apiRoute: string;
  body: {
    source: string;
    slug?: string;
    propsSchema?: ReadonlyArray<{
      name: string;
      type: string;
      required: boolean;
    }>;
  };
};

/** Asks the server to build the unsaved source. Never rejects. */
export const requestCheck = async ({
  apiRoute,
  body
}: RequestArgs): Promise<CheckOutcome> => {
  try {
    const response = await fetch(`${apiRoute}/custom-components/check`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (response.status === 401 || response.status === 403) {
      return { status: 'forbidden' };
    }
    if (!response.ok) {
      return { status: 'failed' };
    }
    const result = parseCheckResult(await response.json());
    return result ? { status: 'done', result } : { status: 'failed' };
  } catch (error) {
    console.warn('The component check could not be run', error);
    return { status: 'failed' };
  }
};

export type MarkerSpec = {
  severity: ComponentDiagnostic['severity'];
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

/**
 * Places findings on the source. A finding with no line goes on the first;
 * one past the end goes on the last. Each marks the word at its column.
 */
export const toMarkers = (
  diagnostics: readonly ComponentDiagnostic[],
  lines: readonly string[]
): MarkerSpec[] =>
  diagnostics.map(({ message, severity, line, column }) => {
    const lineNumber = Math.min(Math.max(line, 1), Math.max(lines.length, 1));
    const text = lines[lineNumber - 1] ?? '';
    const startColumn = Math.min(Math.max(column, 1), text.length + 1);
    const word = /^[\w$]+/.exec(text.slice(startColumn - 1))?.[0];
    return {
      severity,
      message,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn: Math.min(startColumn + (word?.length ?? 1), text.length + 1)
    };
  });

/** Findings that point at the declaration rather than a line of code. */
export const unlocated = (
  diagnostics: readonly ComponentDiagnostic[]
): ComponentDiagnostic[] => diagnostics.filter(({ line }) => line < 1);
