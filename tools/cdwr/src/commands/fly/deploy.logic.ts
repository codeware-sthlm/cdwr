import { z } from 'zod';

import { UsageError } from '../../cli/errors';
import type { WorkflowRun } from '../../services/github';

export const DEPLOY_WORKFLOW = 'fly-deployment.yml';

/** The branch a production deployment runs from */
export const PRODUCTION_REF = 'main';

const nxJsonSchema = z.object({
  release: z.object({
    groups: z.record(
      z.string(),
      z.object({ projects: z.array(z.string()) }).partial()
    )
  })
});

/** The projects of a release group in nx.json: the apps the workflow can deploy */
export function releaseGroupApps(nxJson: unknown, group = 'apps'): string[] {
  const parsed = nxJsonSchema.safeParse(nxJson);
  return parsed.success
    ? (parsed.data.release.groups[group]?.projects ?? [])
    : [];
}

/** The pull request a deployment is for: required for preview, never for production */
export function resolvePullRequest(
  environment: 'preview' | 'production',
  given: number | undefined,
  current: number | undefined
): number | undefined {
  if (environment === 'production') {
    if (given !== undefined) {
      throw new UsageError('--pr does not apply to production');
    }
    return undefined;
  }
  const pr = given ?? current;
  if (pr === undefined) {
    throw new UsageError(
      'A preview deployment needs a pull request: pass --pr',
      'The current branch has no pull request'
    );
  }
  return pr;
}

export interface Deployment {
  app: string;
  environment: 'preview' | 'production';
  pr?: number;
  tenant?: string;
}

/** The workflow_dispatch inputs of a deployment */
export const dispatchInputs = ({
  app,
  environment,
  pr,
  tenant
}: Deployment): Record<string, string> => ({
  app,
  environment,
  ...(tenant ? { tenant } : {}),
  ...(pr !== undefined ? { 'pr-number': String(pr) } : {})
});

/** `Dispatch Fly Deployment: builder → preview, PR #566, tenant moon` */
export const deploymentLabel = ({
  app,
  environment,
  pr,
  tenant
}: Deployment): string =>
  [
    `Dispatch Fly Deployment: ${app} → ${environment}`,
    ...(pr !== undefined ? [`PR #${pr}`] : []),
    ...(tenant ? [`tenant ${tenant}`] : [])
  ].join(', ');

/**
 * The run a dispatch started: the first one not seen before it. A run takes a
 * moment to show up, so the lookup is retried.
 */
export async function findStartedRun(
  list: () => Promise<WorkflowRun[]>,
  known: ReadonlySet<number>,
  wait: (ms: number) => Promise<void>,
  attempts = 6,
  delayMs = 2000
): Promise<WorkflowRun | undefined> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(delayMs);
    const run = (await list().catch(() => [])).find(({ id }) => !known.has(id));
    if (run) return run;
  }
  return undefined;
}
