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
    { number: number; head: { ref: string } } | undefined;

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

  // On open/reopen: ensure the preview label is present and continue
  if (action === 'opened' || action === 'reopened') {
    const octokit = github.getOctokit(token);
    const { data: existing } = await octokit.rest.issues.listLabelsOnIssue({
      ...context.repo,
      issue_number: prNumber
    });

    if (!existing.some((l) => l.name === previewLabel)) {
      await octokit.rest.issues.addLabels({
        ...context.repo,
        issue_number: prNumber,
        labels: [previewLabel]
      });
      core.info(`Added preview label '${previewLabel}' -> continue`);
    } else {
      core.info(`Preview label '${previewLabel}' already present -> continue`);
    }
    return { skip: false };
  }

  // All other PR events (synchronize, labeled, etc.): gate on label
  const octokit = github.getOctokit(token);
  const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
    ...context.repo,
    issue_number: prNumber
  });

  if (labels.some((l) => l.name === previewLabel)) {
    core.info(`Preview label '${previewLabel}' present -> continue`);
    return { skip: false };
  }

  // A newer push cancels the run that opened the PR, possibly before it added
  // the label. Add it here unless someone removed it on purpose.
  const events = await octokit.paginate(octokit.rest.issues.listEvents, {
    ...context.repo,
    issue_number: prNumber,
    per_page: 100
  });
  const removed = events.some(
    (e) =>
      e.event === 'unlabeled' && 'label' in e && e.label?.name === previewLabel
  );

  if (removed) {
    core.info(`Preview label '${previewLabel}' was removed -> skip`);
    return { skip: true };
  }

  await octokit.rest.issues.addLabels({
    ...context.repo,
    issue_number: prNumber,
    labels: [previewLabel]
  });
  core.info(`Added missing preview label '${previewLabel}' -> continue`);
  return { skip: false };
}
