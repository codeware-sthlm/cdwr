import type {
  ComponentDiagnostic,
  ComponentProp
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

/** Findings that sit on a line of the source. */
export const located = (
  diagnostics: readonly ComponentDiagnostic[]
): ComponentDiagnostic[] => diagnostics.filter(({ line }) => line >= 1);
