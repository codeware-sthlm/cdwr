import type { ProjectGraphProjectNode } from '@nx/devkit';
import type { NxReleaseVersionResult } from 'nx/src/command-line/release/version';
import type { PackageJson } from 'nx/src/utils/package-json';

export type Mode = 'release' | 'publish';

type VersionData = NxReleaseVersionResult['projectsVersionData'];

/** Whether any project in a version preview has something new to release */
export const hasNewVersion = (versionData: VersionData): boolean =>
  Object.values(versionData).some((v) => v.newVersion);

/** One plan line per project with a new version, "Bump x to y" */
export const bumpSteps = (versionData: VersionData): string[] =>
  Object.entries(versionData)
    .filter(([, v]) => v.newVersion)
    .map(([project, v]) => `Bump ${project} to ${v.newVersion}`);

export type ReleaseDecision = 'nothing' | 'deferred' | 'publish';

/**
 * What a 'release' run does once it knows whether a version bump exists.
 * The old CLI's dryRun leg is gone: that is the global --dry-run now, and the
 * runtime stops before apply on its own, so it never reaches this decision.
 */
export const decideRelease = (
  found: boolean,
  postponePublish: boolean
): ReleaseDecision => {
  if (!found) return 'nothing';
  return postponePublish ? 'deferred' : 'publish';
};

/** Projects with an `nx-release-publish` target, the ones that can ship */
export const publishableProjects = (
  nodes: Record<string, ProjectGraphProjectNode>
): string[] =>
  Object.values(nodes)
    .filter((node) => node.data.targets?.['nx-release-publish'])
    .map((node) => node.name);

/**
 * Whether Nx's own version bump touched the workspace package.json in a way
 * that must be reverted: it happens because nx-payload sits in devDependencies.
 */
export const shouldRevertPackageJson = (
  origin: PackageJson,
  versionData: VersionData
): boolean =>
  Boolean(versionData['nx-payload']?.newVersion) &&
  Boolean(origin.devDependencies?.['@cdwr/nx-payload']);

export interface PublishStats {
  successful: number;
  total: number;
}

/** The old outro text, one line per outcome */
export const publishSummary = (
  mode: Mode,
  stats: PublishStats | null
): { summary: string; partial: boolean } => {
  if (!stats) {
    return {
      summary: mode === 'publish' ? 'Publish failed' : 'Release failed',
      partial: true
    };
  }
  if (!stats.total)
    return { summary: 'No packages to publish', partial: false };

  const term = mode === 'publish' ? 'Publish' : 'Release';
  const termed = mode === 'publish' ? 'Published' : 'Released';
  if (stats.successful === stats.total) {
    return { summary: `${termed} successfully`, partial: false };
  }
  if (stats.successful > 0) {
    return {
      summary: `${termed} ${stats.successful} successfully, while ${stats.total - stats.successful} failed`,
      partial: true
    };
  }
  return { summary: `${term} failed`, partial: true };
};
