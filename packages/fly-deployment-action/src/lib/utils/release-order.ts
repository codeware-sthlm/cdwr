import * as exec from '@actions/exec';

/** The tag when it is a production release of the project, previews excluded (same rule as the desk's `releaseTag`) */
export const releaseTag = (project: string, tag: string): string | null =>
  new RegExp(`^${project}-\\d+\\.\\d+\\.\\d+$`).test(tag) ? tag : null;

/**
 * The project's newest production release tag on `origin/main`,
 * or `null` when it has none yet.
 */
export const latestReleaseTag = async (
  project: string
): Promise<string | null> => {
  const { stdout } = await exec.getExecOutput(
    'git',
    [
      'tag',
      '--list',
      `${project}-*`,
      '--merged',
      'origin/main',
      '--sort=-v:refname'
    ],
    { silent: true }
  );

  return (
    stdout
      .split('\n')
      .map((line) => line.trim())
      .find((tag) => releaseTag(project, tag)) ?? null
  );
};

/** Whether the commit contains the tag, i.e. is not older than that release */
export const holdsRelease = async (
  tag: string,
  sha: string
): Promise<boolean> => {
  const { exitCode, stderr } = await exec.getExecOutput(
    'git',
    ['merge-base', '--is-ancestor', `refs/tags/${tag}`, sha],
    { silent: true, ignoreReturnCode: true }
  );

  if (exitCode === 0) return true;
  if (exitCode === 1) return false;
  throw new Error(
    `git merge-base exited ${exitCode}: ${stderr.trim() || 'no output'}`
  );
};

/**
 * Whether a production deploy of `sha` may run for the project.
 *
 * A re-run of an older deploy can start after a newer one released the
 * project, and would roll production back. Such a commit doesn't contain the
 * newest release tag, so it is skipped. A project without a release deploys.
 *
 * Throws when git can't be read: deploying without the check is what it guards.
 */
export const checkReleaseOrder = async (
  project: string,
  sha: string
): Promise<{ deploy: true } | { deploy: false; reason: string }> => {
  const latest = await latestReleaseTag(project);
  if (!latest || (await holdsRelease(latest, sha))) {
    return { deploy: true };
  }
  return {
    deploy: false,
    reason: `${sha.slice(0, 7)} is older than ${latest}`
  };
};
