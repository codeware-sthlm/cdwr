import { execSync } from 'node:child_process';

import { releaseChangelog } from 'nx/release';

export type AppChangelogRange = {
  /** Version the app was just released as */
  version: string;
  /** Version it was released from — the start of the changelog range */
  previousVersion: string;
};

export type AppChangelogOptions = {
  /** Release range per app, keyed by project name */
  releases: Map<string, AppChangelogRange>;
  /**
   * Create a GitHub release per app. Production only — a release per preview
   * push would bury the real ones. Previews surface the same contents as a
   * pull request comment instead.
   */
  createRelease: boolean;
  /**
   * Where an app's range starts when its previous release tag does not exist,
   * which is the case for an app released for the first time. Defaults to the
   * repository's root commit, so the first changelog lists everything that
   * ever touched the app.
   */
  firstRef?: () => string;
};

const tagExists = (tag: string): boolean => {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
};

const rootCommit = (): string =>
  execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' })
    .trim()
    .split('\n')[0];

/**
 * Render the changelog for each released app.
 *
 * No `CHANGELOG.md` is ever written — apps are not consumed by anyone, so a
 * committed changelog file has no audience and the branch is deliberately left
 * untouched by the release process. The contents are returned instead, and
 * `forceChangelogGeneration` is what lets nx render them without a file or a
 * remote release to write to.
 *
 * The range is nx's default: the app's last release tag up to `HEAD`. In a
 * preview lane that tag is the previous preview deploy, so the result reads as
 * "what this deploy adds", not "what this pull request adds".
 *
 * An app can be released with nothing to show. Selection follows the project
 * graph, but the changelog only lists commits that touched the app's own files
 * — so a shared lib or workspace config change deploys the app and renders an
 * empty changelog. Those are dropped rather than reported as "no changes".
 *
 * @param options - Released versions and whether to create GitHub releases
 * @returns Map of app project name to rendered markdown, skipping empty entries
 */
export const generateAppChangelogs = async ({
  releases,
  createRelease,
  firstRef = rootCommit
}: AppChangelogOptions): Promise<Map<string, string>> => {
  const changelogs = new Map<string, string>();

  // One call per app: `from` is a single global option, but every app starts
  // from its own tag. Without it nx resolves `from` as the newest matching tag
  // — which the workflow has already created for this very release — and every
  // range comes back empty.
  //
  // The ref mirrors `releaseTag.pattern` for the `apps` group in nx.json;
  // changing that pattern means changing this too.
  for (const [projectName, { version, previousVersion }] of releases) {
    // An app released for the first time has no tag to start from
    const previousTag = `${projectName}-${previousVersion}`;
    const from = tagExists(previousTag) ? previousTag : firstRef();

    const { projectChangelogs } = await releaseChangelog({
      projects: [projectName],
      from,
      versionData: {
        [projectName]: {
          currentVersion: previousVersion,
          newVersion: version,
          dependentProjects: []
        }
      },
      createRelease: createRelease ? 'github' : false,
      forceChangelogGeneration: !createRelease,
      // The workflow runs on a detached HEAD and owns tagging itself. Any git
      // write here fails the step outright, so all of them stay off.
      gitCommit: false,
      gitTag: false,
      gitPush: false,
      stageChanges: false
    });

    const contents = projectChangelogs?.[projectName]?.contents?.trim();
    if (contents) {
      changelogs.set(projectName, contents);
    }
  }

  return changelogs;
};
