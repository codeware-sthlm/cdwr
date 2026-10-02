import {
  type BuildDiagnostic,
  type StudioBuild,
  showsDiagnostics,
  sortDiagnostics
} from './build-state';
import { located } from './check';

/** The findings of the last check, while the source still is what was checked */
export type CheckFindings = { diagnostics: readonly BuildDiagnostic[] };

export type FindingsInput = {
  build: StudioBuild | null;
  check: CheckFindings | null;
  /** Whether the source changed since the stored build was read */
  edited: boolean;
};

export type Listed = {
  origin: 'check' | 'build';
  diagnostics: BuildDiagnostic[];
};

/** What the strip lists: the last check when there is one, else the stored build */
export const listedFindings = ({
  build,
  check
}: FindingsInput): Listed | null => {
  if (check) {
    return { origin: 'check', diagnostics: sortDiagnostics(check.diagnostics) };
  }
  return build && showsDiagnostics(build)
    ? { origin: 'build', diagnostics: sortDiagnostics(build.diagnostics) }
    : null;
};

/**
 * What the editor marks. The stored build's findings describe the source it
 * was built from, so they stop being drawn with the first edit.
 */
export const markedFindings = ({
  build,
  check,
  edited
}: FindingsInput): BuildDiagnostic[] => {
  if (check) {
    return located(check.diagnostics);
  }
  return build?.status === 'failed' && !edited
    ? located(build.diagnostics)
    : [];
};
