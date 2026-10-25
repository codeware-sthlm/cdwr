import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  type AppChangelog,
  type AppChangelogRange,
  generateAppChangelogs
} from '@codeware/shared/util/nx-deploy';

import type { ActionInputs } from './schemas/action-inputs.schema';

export type NxChangelogResult = {
  /** App name to rendered markdown */
  changelogs: Record<string, string>;
  /** Tags whose GitHub release could not be created */
  failedReleases: Array<string>;
};

const hasStatus = (error: unknown, status: number): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  error.status === status;

/**
 * Create the GitHub release for one app, unless it already exists.
 *
 * App releases never become the repository's latest release, which belongs
 * to the published packages.
 *
 * @returns `true` when the release exists afterwards
 */
const createAppRelease = async (
  octokit: ReturnType<typeof github.getOctokit>,
  { tag, markdown }: AppChangelog
): Promise<boolean> => {
  const { owner, repo } = github.context.repo;

  try {
    await octokit.rest.repos.getReleaseByTag({ owner, repo, tag });
    core.info(`Release ${tag} exists`);
    return true;
  } catch (error) {
    if (!hasStatus(error, 404)) {
      core.warning(`Could not look up release ${tag}: ${String(error)}`);
      return false;
    }
  }

  try {
    await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tag,
      name: tag,
      body: markdown,
      make_latest: 'false'
    });
    core.info(`Created release ${tag}`);
    return true;
  } catch (error) {
    if (hasStatus(error, 422)) {
      core.info(`Release ${tag} exists`);
      return true;
    }
    core.warning(`Could not create release ${tag}: ${String(error)}`);
    return false;
  }
};

/**
 * Render the changelog for each app that deployed, and create a GitHub
 * release per app when asked to.
 *
 * A missing release never fails the step, so a production deploy is not
 * reported as failed over a changelog.
 *
 * @param inputs Action inputs
 * @returns Rendered markdown per app and the tags that got no release
 */
export async function nxChangelog(
  inputs: ActionInputs
): Promise<NxChangelogResult> {
  const { apps, released, createRelease, token } = inputs;

  const releases = new Map<string, AppChangelogRange>();

  for (const app of apps) {
    if (!released.includes(app.name)) {
      core.info(`Skip: ${app.name} - did not deploy`);
      continue;
    }
    if (app.version === app.previousVersion) {
      // A forced redeploy of an unbumped app ships nothing new
      core.info(`Skip: ${app.name} - redeployed at ${app.version}`);
      continue;
    }
    core.info(`Changelog: ${app.name} ${app.previousVersion} → ${app.version}`);
    releases.set(app.name, {
      version: app.version,
      previousVersion: app.previousVersion
    });
  }

  if (releases.size === 0) {
    core.info('No apps to generate a changelog for');
    return { changelogs: {}, failedReleases: [] };
  }

  core.startGroup('Render changelogs');
  const changelogs = await generateAppChangelogs({ releases });
  core.endGroup();

  for (const name of releases.keys()) {
    if (!changelogs.has(name)) {
      core.info(`${name}: changelog range produced no entries`);
    }
  }

  const failedReleases: Array<string> = [];

  if (createRelease && changelogs.size > 0) {
    core.startGroup('Create GitHub releases');
    const octokit = github.getOctokit(token);
    for (const changelog of changelogs.values()) {
      if (!(await createAppRelease(octokit, changelog))) {
        failedReleases.push(changelog.tag);
      }
    }
    core.endGroup();
  }

  return {
    changelogs: Object.fromEntries(
      [...changelogs].map(([name, { markdown }]) => [name, markdown])
    ),
    failedReleases
  };
}
