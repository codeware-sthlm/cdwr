import type { CustomComponent } from '@codeware/shared/util/payload-types';

export type BuildStatus = CustomComponent['build']['status'];

export type BuildDiagnostic = {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
};

/** What the panel shows: the build group without the bundle itself */
export type BuildState = {
  status: BuildStatus;
  hash: string | null;
  builtAt: string | null;
  diagnostics: BuildDiagnostic[];
};

/** Fields to ask the REST API for, so the bundle stays on the server */
export const buildSelectFields = [
  'status',
  'diagnostics',
  'hash',
  'builtAt'
] as const satisfies ReadonlyArray<keyof CustomComponent['build']>;

export const POLL_INTERVAL_MS = 1000;
export const POLL_TIMEOUT_MS = 60_000;

const statuses = [
  'pending',
  'building',
  'ready',
  'failed'
] as const satisfies ReadonlyArray<BuildStatus>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isBuildStatus = (value: unknown): value is BuildStatus =>
  statuses.some((status) => status === value);

const isDiagnostic = (value: unknown): value is BuildDiagnostic =>
  isRecord(value) &&
  typeof value['message'] === 'string' &&
  typeof value['line'] === 'number' &&
  typeof value['column'] === 'number' &&
  (value['severity'] === 'error' || value['severity'] === 'warning');

/** Keeps the entries that are diagnostics; the column is untyped json. */
export const parseDiagnostics = (value: unknown): BuildDiagnostic[] =>
  Array.isArray(value) ? value.filter(isDiagnostic) : [];

/**
 * Reads a build group from untyped input (a form value or a REST response).
 * Returns null when there is no usable status.
 */
export const parseBuild = (value: unknown): BuildState | null => {
  if (!isRecord(value) || !isBuildStatus(value['status'])) {
    return null;
  }
  return {
    status: value['status'],
    hash: typeof value['hash'] === 'string' ? value['hash'] : null,
    builtAt: typeof value['builtAt'] === 'string' ? value['builtAt'] : null,
    diagnostics: parseDiagnostics(value['diagnostics'])
  };
};

/** A build is still in flight while it waits or runs. */
export const shouldPoll = (status: BuildStatus | undefined): boolean =>
  status === 'pending' || status === 'building';

/** Errors first, then warnings; source order within each. */
export const sortDiagnostics = (
  diagnostics: ReadonlyArray<BuildDiagnostic>
): BuildDiagnostic[] =>
  [...diagnostics].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    return a.line - b.line || a.column - b.column;
  });

/** Empty for a finding that is not about a source line, which carries line 0 */
export const formatPosition = ({
  line,
  column
}: Pick<BuildDiagnostic, 'line' | 'column'>): string =>
  line > 0 ? `${line}:${column}` : '';

/** A failed build leaves the last good bundle in place, which has a hash. */
export const isServingPrevious = (build: BuildState): boolean =>
  build.status === 'failed' && Boolean(build.hash);

/** A build that went through but has something to report. */
export const isBuiltWithWarnings = (build: BuildState): boolean =>
  build.status === 'ready' && build.diagnostics.length > 0;

/** Diagnostics show whenever there are any: errors when failed, else warnings. */
export const showsDiagnostics = (build: BuildState): boolean =>
  (build.status === 'failed' || build.status === 'ready') &&
  build.diagnostics.length > 0;
