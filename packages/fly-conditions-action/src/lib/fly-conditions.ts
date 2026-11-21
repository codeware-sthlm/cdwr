import * as core from '@actions/core';
import * as github from '@actions/github';

import type { ActionInputs } from './schemas/action-inputs.schema';

const BLOCKED_PREFIXES = ['renovate', 'update-nx-workspace'];

type Result = {
  skip: boolean;
};

export async function flyConditions({
  previewLabel,
  token
}: ActionInputs): Promise<Result> {
  const { context } = github;
  const { eventName, ref, payload } = context;

  const pr = payload['pull_request'] as
    { number: number; state?: string; head: { ref: string } } | undefined;

  const branchName = pr?.head?.ref ?? ref.replace('refs/heads/', '');
  const action = payload['action'] as string | undefined;
  const prNumber =
    pr?.number ?? (payload['issue'] as { number?: number } | undefined)?.number;

  core.info(
    [
      'Analyzing deployment conditions:',
      `  Branch:        ${branchName || 'N/A'}`,
      `  Event:         ${eventName}`,
      `  Action:        ${action || 'N/A'}`,
      `  PR number:     ${prNumber ?? 'N/A'}`,
      `  Preview label: ${previewLabel}`
    ].join('\n')
  );

  if (eventName === 'workflow_dispatch') {
    core.info('Manual workflow dispatch -> continue');
    return { skip: false };
  }

  if (BLOCKED_PREFIXES.some((prefix) => branchName.startsWith(prefix))) {
    core.info(`Blocked branch prefix '${branchName}' -> skip`);
    return { skip: true };
  }

  if (eventName !== 'pull_request') {
    core.info('Non pull request event -> continue');
    return { skip: false };
  }

  if (!prNumber) {
    core.setFailed('Could not determine pull request number from context');
    return { skip: true };
  }

  if (action === 'closed') {
    core.info('Pull request closed -> continue');
    return { skip: false };
  }

  // The label is an opt-in, never added here. Adding it deploys at once;
  // adding any other label deploys nothing.
  if (action === 'labeled') {
    // `closed` already tore the preview down, and nothing would tear a new one down
    if (pr?.state !== 'open') {
      core.info(`Pull request is ${pr?.state ?? 'N/A'}, not open -> skip`);
      return { skip: true };
    }
    const added = (payload['label'] as { name?: string } | undefined)?.name;
    if (added === previewLabel) {
      core.info(`Preview label '${previewLabel}' added -> continue`);
      return { skip: false };
    }
    core.info(`Label '${added ?? 'N/A'}' is not the preview label -> skip`);
    return { skip: true };
  }

  // All other PR events (opened, reopened, synchronize): gate on label
  const octokit = github.getOctokit(token);
  const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
    ...context.repo,
    issue_number: prNumber
  });

  if (labels.some((l) => l.name === previewLabel)) {
    core.info(`Preview label '${previewLabel}' present -> continue`);
    return { skip: false };
  }

  core.info(`Preview label '${previewLabel}' not present -> skip`);
  return { skip: true };
}
