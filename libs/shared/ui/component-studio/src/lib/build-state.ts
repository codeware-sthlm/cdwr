import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type { ComponentDiagnostic } from '@codeware/shared/util/payload-utils';

export type BuildStatus = CustomComponent['build']['status'];

export type BuildDiagnostic = ComponentDiagnostic;

/** What the studio shows of a build: the stored group without the bundle */
export type BuildState = {
  status: BuildStatus;
  hash: string | null;
  builtAt: string | null;
  diagnostics: BuildDiagnostic[];
};

/** What the toolchain reports about the job, when the host knows it */
export type BuildJob = {
  /** The toolchain step that failed, e.g. `bundle` */
  step: string | null;
  durationMs: number | null;
};

export type StudioBuild = BuildState & {
  job?: BuildJob;
  /** Still pending or building, yet nothing has changed for a long while */
  stale?: boolean;
};

/** A build is still in flight while it waits or runs. */
export const shouldPoll = (status: BuildStatus | undefined): boolean =>
  status === 'pending' || status === 'building';

/** A rebuild helps once a build has failed or has gone quiet. */
export const canRebuild = (build: StudioBuild | null): boolean =>
  build !== null &&
  (build.status === 'failed' ||
    (shouldPoll(build.status) && build.stale === true));

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
