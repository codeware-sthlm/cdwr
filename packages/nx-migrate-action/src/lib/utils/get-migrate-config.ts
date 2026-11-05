import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  getRepositoryDefaultBranch,
  redactConfig,
  withGitHub
} from '@codeware/shared/util/github';

import { getActorId } from './get-actor-id';
import { parseNameEmail } from './parse-name-email';
import { MigrateConfigSchema } from './schema';
import type { ActionInputs, MigrateConfig } from './types';

/**
 * Get migrate configuration from action inputs,
 * including default values and validation.
 *
 * @param inputs Action inputs
 * @returns Migrate configuration
 * @throws If configuration is invalid
 */
export const getMigrateConfig = async (
  inputs: ActionInputs
): Promise<MigrateConfig> => {
  const {
    author: authorInput,
    autoMerge: autoMergeInput,
    checkToken,
    committer: committerInput,
    dryRun,
    frequency,
    mainBranch: mainBranchInput,
    packagePatterns,
    prAssignees: prAssigneesInput,
    skipTests,
    skipE2E,
    token
  } = inputs;

  const octokit = github.getOctokit(token);

  // Check main branch; if not provided, get default branch
  const mainBranch =
    mainBranchInput || (await getRepositoryDefaultBranch(token));

  // Check auto-merge; must be enabled for the repository
  const {
    data: { allow_auto_merge }
  } = await withGitHub(() =>
    octokit.rest.repos.get({
      ...github.context.repo
    })
  );
  if (!allow_auto_merge && autoMergeInput) {
    core.warning(
      'Auto-merge is not enabled for this repository, ignoring auto-merge option'
    );
  }
  const autoMerge = !!allow_auto_merge && autoMergeInput;

  // Check author; if not provided, use actor
  let author = parseNameEmail(authorInput);
  if (!author.email) {
    const id = await getActorId(token);
    if (id) {
      author = {
        name: github.context.actor,
        email: `${id}+${github.context.actor}@users.noreply.github.com`
      };
    }
  }

  // Check committer; if not provided, use github official bot
  let committer = parseNameEmail(committerInput);
  if (!committer.email) {
    committer = {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com'
    };
  }

  // Check package patterns; if not provided, use default pattern
  if (!packagePatterns.length) {
    packagePatterns.push('packages/**/package.json');
  }

  // Check PR assignees; optional
  const prAssignees = prAssigneesInput.split(',').filter(Boolean);

  const config: MigrateConfig = {
    author: author.email ? author : undefined,
    autoMerge,
    checkToken,
    committer,
    dryRun,
    frequency,
    mainBranch,
    packagePatterns,
    prAssignees,
    skipTests,
    skipE2E,
    token
  };
  core.info(JSON.stringify(redactConfig(config), null, 2));

  // Validate and return migrate configuration
  return MigrateConfigSchema.parse(config);
};
