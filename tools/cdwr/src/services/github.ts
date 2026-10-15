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
  url: string;
}

/**
 * Trigger a workflow. `gh` prints the URL of the run it created when GitHub
 * answers with it, which names the run exactly; `runId` is absent otherwise.
 */
export async function dispatchWorkflow(
  cwd: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>
): Promise<{ args: string[]; runId?: number }> {
  const args = [
    'workflow',
    'run',
    workflow,
    '--ref',
    ref,
    ...Object.entries(inputs).flatMap(([k, v]) => ['-f', `${k}=${v}`])
  ];
  const { stdout } = await run('gh', args, { cwd });
  const match = stdout.match(/\/actions\/runs\/(\d+)/);
  return match?.[1] ? { args, runId: Number(match[1]) } : { args };
}

/** One run by id */
export async function viewRun(cwd: string, id: number): Promise<WorkflowRun> {
  const { stdout } = await run(
    'gh',
    ['run', 'view', String(id), '--json', 'databaseId,status,conclusion,url'],
    { cwd }
  );
  const r = JSON.parse(stdout) as {
    databaseId: number;
    status: string;
    conclusion?: string | null;
    url: string;
  };
  return {
    id: r.databaseId,
    status: r.status,
    conclusion: r.conclusion ?? '',
    url: r.url
  };
}

/** Trigger a workflow and return the arguments used, for a copy-paste retry */
export async function runWorkflow(
  cwd: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>
): Promise<string[]> {
  return (await dispatchWorkflow(cwd, workflow, ref, inputs)).args;
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
      'databaseId,status,conclusion,url'
    ],
    { cwd }
  );
  return (
    JSON.parse(stdout) as Array<{
      databaseId: number;
      status: string;
      conclusion?: string | null;
      url: string;
    }>
  ).map((r) => ({
    id: r.databaseId,
    status: r.status,
    conclusion: r.conclusion ?? '',
    url: r.url
  }));
}
