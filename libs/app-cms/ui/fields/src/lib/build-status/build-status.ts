import type {
  BuildDiagnostic,
  BuildState,
  BuildStatus
} from '@codeware/shared/ui/component-studio';
import type { CustomComponent } from '@codeware/shared/util/payload-types';

export {
  type BuildDiagnostic,
  type BuildState,
  type BuildStatus,
  formatPosition,
  isBuiltWithWarnings,
  isServingPrevious,
  shouldPoll,
  showsDiagnostics,
  sortDiagnostics
} from '@codeware/shared/ui/component-studio';

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
