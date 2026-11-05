import * as core from '@actions/core';
import { maskSecretsIn, redactConfig } from '@codeware/shared/util/github';

import { nxMigrate } from './nx-migrate';
import { ActionInputsSchema } from './utils/schema';
import { ActionInputs } from './utils/types';

/**
 * Main action function
 */
export async function run(): Promise<void> {
  try {
    const inputs = ActionInputsSchema.parse({
      token: core.getInput('token', { required: true }),
      autoMerge: core.getBooleanInput('auto-merge'),
      checkToken: core.getBooleanInput('check-token'),
      committer: core.getInput('committer'),
      author: core.getInput('author'),
      mainBranch: core.getInput('main-branch'),
      frequency: (core.getInput('frequency') ||
        'patch') as ActionInputs['frequency'],
      packagePatterns: core.getMultilineInput('package-patterns'),
      prAssignees: core.getInput('pull-request-assignees'),
      skipTests: core.getBooleanInput('skip-tests'),
      skipE2E: core.getBooleanInput('skip-e2e'),
      dryRun: core.getBooleanInput('dry-run')
    } satisfies ActionInputs);

    maskSecretsIn(inputs);
    core.debug(`Inputs:\n${JSON.stringify(redactConfig(inputs), null, 2)}`);

    // Run nx migration
    const {
      currentVersion,
      isMigrated,
      latestVersion,
      pullRequest,
      updateType
    } = await nxMigrate(inputs);

    // Set action outputs
    core.setOutput('current-version', currentVersion);
    core.setOutput('latest-version', latestVersion);
    core.setOutput('update-type', updateType);
    core.setOutput('is-migrated', isMigrated);
    core.setOutput('pull-request', pullRequest);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
