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
  /** Version each app was last released as, keyed by project name */
  previousVersions: Map<string, string>;
};

const tagExists = async (tag: string): Promise<boolean> =>
  (await git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], true)) !== '';

const rootCommit = async (): Promise<string> =>
  (await git(['rev-list', '--max-parents=0', 'HEAD'])).split('\n')[0];

/**
 * Resolve the range of changes each app is judged on.
 *
 * - Preview: the pull request's own changes, `merge-base(origin/main, head)`
 *   up to the PR head. The head is fetched as a ref, so the result is the same
 *   whichever commit the workflow checked out. Fetching runs no PR code.
 * - Production: from the app's last release tag, `<app>-<previousVersion>`,
 *   up to `HEAD`. An app never released before starts at the root commit.
 */
export const resolveRanges = async ({
  preid,
  prNumber,
  previousVersions
}: ResolveRangesOptions): Promise<Map<string, DiffRange>> => {
  const ranges = new Map<string, DiffRange>();

  if (preid) {
    let head = 'HEAD';
    if (prNumber) {
      await git([
        'fetch',
        '--no-tags',
        'origin',
        `+refs/pull/${prNumber}/head`
      ]);
      head = 'FETCH_HEAD';
    }
    head = await git(['rev-parse', head]);
    const base = await git(['merge-base', 'origin/main', head]);

    for (const app of previousVersions.keys()) {
      ranges.set(app, { base, head });
    }
    return ranges;
  }

  const head = await git(['rev-parse', 'HEAD']);

  for (const [app, previousVersion] of previousVersions) {
    const tag = `${app}-${previousVersion}`;
    const base = (await tagExists(tag)) ? tag : await rootCommit();
    ranges.set(app, { base, head });
  }

  return ranges;
};
