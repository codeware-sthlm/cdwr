import { git } from './git';

/** A git range, `base` exclusive */
export type DiffRange = {
  base: string;
  head: string;
};

export type ResolveRangesOptions = {
  /** Preview lane id; set for previews, absent for production */
  preid?: string;
  /** Pull request number, for fetching its head in a preview */
  prNumber?: number;
  /** The branch previews are compared with, without `origin/` */
  mainBranch?: string;
  /** Version each app was last released as, keyed by project name */
  previousVersions: Map<string, string>;
};

const SHA = /^[0-9a-f]{40}$/;

/** A full commit SHA from git, or throw: nothing else reaches a git argument */
const sha = async (args: string[]): Promise<string> => {
  const out = await git(args);
  if (!SHA.test(out)) {
    throw new Error(`git ${args[0]} did not return a commit: ${out}`);
  }
  return out;
};

const tagExists = async (tag: string): Promise<boolean> =>
  (await git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], true)) !== '';

const rootCommit = async (): Promise<string> => {
  const root = (await git(['rev-list', '--max-parents=0', 'HEAD'])).split(
    '\n'
  )[0];
  if (!SHA.test(root)) {
    throw new Error(`git rev-list did not return a commit: ${root}`);
  }
  return root;
};

/**
 * Resolve the range of changes each app is judged on.
 *
 * - Preview: the pull request's own changes, `merge-base(origin/<main>, head)`
 *   up to the PR head. The head is fetched as a ref, so the result is the same
 *   whichever commit the workflow checked out. Fetching runs no PR code.
 * - Production: from the app's last release tag, `<app>-<previousVersion>`,
 *   up to `HEAD`. An app never released before starts at the root commit.
 */
export const resolveRanges = async ({
  preid,
  prNumber,
  mainBranch = 'main',
  previousVersions
}: ResolveRangesOptions): Promise<Map<string, DiffRange>> => {
  const ranges = new Map<string, DiffRange>();

  if (preid) {
    // Only a positive integer and a plain branch name reach git as arguments
    if (
      prNumber !== undefined &&
      !(Number.isInteger(prNumber) && prNumber > 0)
    ) {
      throw new Error(`Not a pull request number: ${prNumber}`);
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(mainBranch) || mainBranch.startsWith('-')) {
      throw new Error(`Not a branch name: ${mainBranch}`);
    }
    let head = 'HEAD';
    if (prNumber) {
      // `--` ends the options, so nothing after it can become one (`--upload-pack`)
      await git([
        'fetch',
        '--no-tags',
        '--',
        'origin',
        `+refs/pull/${prNumber}/head`
      ]);
      head = 'FETCH_HEAD';
    }
    head = await sha(['rev-parse', '--verify', `${head}^{commit}`]);
    const base = await sha(['merge-base', `origin/${mainBranch}`, head]);

    for (const app of previousVersions.keys()) {
      ranges.set(app, { base, head });
    }
    return ranges;
  }

  const head = await sha(['rev-parse', '--verify', 'HEAD^{commit}']);

  for (const [app, previousVersion] of previousVersions) {
    const tag = `${app}-${previousVersion}`;
    const base = (await tagExists(tag)) ? tag : await rootCommit();
    ranges.set(app, { base, head });
  }

  return ranges;
};
