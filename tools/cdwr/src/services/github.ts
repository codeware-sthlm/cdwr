import { run } from './shell';

/** The pull request of the current branch, if the branch has one */
export async function currentPullRequest(
  cwd: string
): Promise<number | undefined> {
  try {
    const { stdout } = await run('gh', ['pr', 'view', '--json', 'number'], {
      cwd
    });
    const { number } = JSON.parse(stdout) as { number?: number };
    return number;
  } catch {
    return undefined;
  }
}

/** The branch a pull request comes from */
export async function pullRequestBranch(
  cwd: string,
  pullRequest: number
): Promise<string> {
  const { stdout } = await run(
    'gh',
    [
      'pr',
      'view',
      String(pullRequest),
      '--json',
      'headRefName',
      '--jq',
      '.headRefName'
    ],
    { cwd }
  );
  return stdout.trim();
}

export interface WorkflowRun {
  id: number;
  status: string;
  /** Empty until the run has completed */
  conclusion: string;
  /** What started the run, such as `workflow_dispatch` or `push` */
  event: string;
  /** ISO time the run was created */
  createdAt: string;
  url: string;
}

/** Trigger a workflow and return the arguments used, for a copy-paste retry */
export async function runWorkflow(
  cwd: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>
): Promise<string[]> {
  const args = [
    'workflow',
    'run',
    workflow,
    '--ref',
    ref,
    ...Object.entries(inputs).flatMap(([k, v]) => ['-f', `${k}=${v}`])
  ];
  await run('gh', args, { cwd });
  return args;
}

/** Recent runs of a workflow on a branch */
export async function listWorkflowRuns(
  cwd: string,
  workflow: string,
  branch: string,
  limit = 3
): Promise<WorkflowRun[]> {
  const { stdout } = await run(
    'gh',
    [
      'run',
      'list',
      '--workflow',
      workflow,
      '--branch',
      branch,
      '--limit',
      String(limit),
      '--json',
      'databaseId,status,conclusion,event,createdAt,url'
    ],
    { cwd }
  );
  return (
    JSON.parse(stdout) as Array<{
      databaseId: number;
      status: string;
      conclusion?: string | null;
      event: string;
      createdAt: string;
      url: string;
    }>
  ).map((r) => ({
    id: r.databaseId,
    status: r.status,
    conclusion: r.conclusion ?? '',
    event: r.event,
    createdAt: r.createdAt,
    url: r.url
  }));
}
