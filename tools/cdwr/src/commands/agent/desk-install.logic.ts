import { z } from 'zod';

export const WORKFLOW = 'desk.yml';
export const ARTIFACT = 'agent-desk-macos-arm64';
export const APP_DIR = '/Applications';
export const APP_NAME = 'Agent Desk';
/** The running process: the Cargo binary, not the bundle's display name */
export const APP_PROCESS = 'agent-desk';
export const APP_PATH = `${APP_DIR}/${APP_NAME}.app`;
/** The zipped bundle inside the artifact */
export const APP_ZIP = `${APP_NAME}.app.zip`;

/** The reason the desk cannot be installed here; undefined on macOS arm64 */
export const platformProblem = (
  platform: string,
  arch: string
): string | undefined =>
  platform === 'darwin' && arch === 'arm64'
    ? undefined
    : `The Agent Desk is built for macOS arm64 only, this is ${platform} ${arch}`;

const runsSchema = z.array(
  z.object({
    databaseId: z.number(),
    headSha: z.string(),
    headBranch: z.string(),
    event: z.string(),
    conclusion: z.string(),
    createdAt: z.string()
  })
);

export type DeskRun = z.infer<typeof runsSchema>[number];

/** The runs of `gh run list --json databaseId,headSha,headBranch,event,conclusion,createdAt`; none when it isn't that */
export const parseRuns = (text: string): DeskRun[] => {
  try {
    const parsed = runsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const prSchema = z.object({
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  isCrossRepository: z.boolean()
});

export interface PrHead {
  branch: string;
  sha: string;
  /** From a fork, whose branch name may also exist upstream */
  fork: boolean;
}

/** The branch, head commit and origin of `gh pr view --json headRefName,headRefOid,isCrossRepository` */
export const parsePrHead = (text: string): PrHead | undefined => {
  try {
    const parsed = prSchema.safeParse(JSON.parse(text));
    return parsed.success
      ? {
          branch: parsed.data.headRefName,
          sha: parsed.data.headRefOid,
          fork: parsed.data.isCrossRepository
        }
      : undefined;
  } catch {
    return undefined;
  }
};

/** Events whose build is of the branch's own code; a `push` to a fork's `main` is not the PR's */
const PR_EVENTS: readonly string[] = ['pull_request', 'workflow_dispatch'];
/** A manual run on a fork PR's branch name is a run of the upstream branch, so only PR runs count */
const FORK_PR_EVENTS: readonly string[] = ['pull_request'];
const MAIN_EVENTS: readonly string[] = ['push', 'workflow_dispatch'];

const newest = (runs: DeskRun[]): DeskRun | undefined =>
  [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

/**
 * The newest successful run. Without a PR: a push or manual run on main.
 * With one: a run of its head commit, else the newest pull request or manual run of its branch
 * (pull request runs only for a fork).
 */
export const chooseRun = (
  runs: DeskRun[],
  pr?: PrHead
): DeskRun | undefined => {
  const succeeded = runs.filter((run) => run.conclusion === 'success');
  if (!pr) {
    return newest(
      succeeded.filter(
        (run) => run.headBranch === 'main' && MAIN_EVENTS.includes(run.event)
      )
    );
  }
  return (
    newest(succeeded.filter((run) => run.headSha === pr.sha)) ??
    newest(
      succeeded.filter(
        (run) =>
          run.headBranch === pr.branch &&
          (pr.fork ? FORK_PR_EVENTS : PR_EVENTS).includes(run.event)
      )
    )
  );
};

/** How long a quitting app gets to exit, and how often it is checked */
export const QUIT_WAIT_MS = 10_000;
export const QUIT_POLL_MS = 500;

/** Whether the wait for the app to exit is over after `elapsedMs` */
export const quitGaveUp = (elapsedMs: number): boolean =>
  elapsedMs >= QUIT_WAIT_MS;

export const quitProblem = `${APP_NAME} did not quit`;
export const quitFix = `Quit ${APP_NAME} and run the command again`;

/** The aside copy of the installed app while it is being replaced */
export const PREVIOUS_PATH = `${APP_PATH}.previous`;

/** `xattr -d` failing because the flag was not there, which is the state we want */
export const isMissingXattr = (stderr: string): boolean =>
  /No such xattr/i.test(stderr);

const short = (sha: string): string => sha.slice(0, 7);

/** Said when the build is of an older commit than the PR's head */
export const staleNote = (run: DeskRun, pr?: PrHead): string | undefined =>
  pr && run.headSha !== pr.sha
    ? `Built from ${short(run.headSha)}, the PR is at ${short(pr.sha)}`
    : undefined;

export type ArtifactVerdict = 'present' | 'expired' | 'missing';

const artifactsSchema = z.object({
  artifacts: z.array(z.object({ name: z.string(), expired: z.boolean() }))
});

/** Whether the run still holds the desk artifact, from `gh api …/actions/runs/<id>/artifacts` */
export const artifactVerdict = (text: string): ArtifactVerdict => {
  let parsed: z.SafeParseReturnType<unknown, z.infer<typeof artifactsSchema>>;
  try {
    parsed = artifactsSchema.safeParse(JSON.parse(text));
  } catch {
    return 'missing';
  }
  const found = parsed.success
    ? parsed.data.artifacts.find((artifact) => artifact.name === ARTIFACT)
    : undefined;
  if (!found) return 'missing';
  return found.expired ? 'expired' : 'present';
};

/** How to get a build when there is none to install; `branch` is the PR's */
export const rebuildFix = (branch?: string): string =>
  `Run the workflow again with \`gh workflow run ${WORKFLOW}${branch ? ` --ref ${branch}` : ''}\`, or build it here with \`nx tauri-build desk\``;

export const noRunProblem = (pr?: number): string =>
  pr === undefined
    ? 'No successful build of main has been found'
    : `No successful build of PR ${pr} has been found`;

export const artifactProblem = (verdict: 'expired' | 'missing'): string =>
  verdict === 'expired'
    ? 'The build is too old, its artifact has expired'
    : `The build has no ${ARTIFACT} artifact`;

/** The steps the plan prints */
export const installSteps = (
  run: DeskRun,
  replacing: boolean
): Array<{ label: string; detail?: string }> => [
  {
    label: `Download the build of ${short(run.headSha)}`,
    detail: `run ${run.databaseId} on ${run.headBranch}`
  },
  { label: `Unpack ${APP_ZIP}` },
  { label: `Quit ${APP_NAME} if it is running` },
  {
    label: replacing ? `Replace ${APP_PATH}` : `Install ${APP_PATH}`,
    detail: replacing ? 'settings live outside the app and are kept' : undefined
  },
  { label: 'Clear the quarantine flag' }
];

/** Says where the app went and how to open it */
export const installedSummary = (): string =>
  `Installed ${APP_PATH}. Open it with: open "${APP_PATH}"`;
