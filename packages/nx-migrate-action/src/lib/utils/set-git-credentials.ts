import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

import type { MigrateConfig } from './types';

/**
 * Set git user and remote URL to use token authentication
 * via HTTPS instead of SSH.
 *
 * @param config Migration configuration
 */
export const setGitCredentials = async (
  config: MigrateConfig
): Promise<void> => {
  const { committer, token } = config;

  const { repo, owner } = github.context.repo;

  // Set git committer
  await exec.exec('git', ['config', 'user.name', committer.name]);
  await exec.exec('git', ['config', 'user.email', committer.email]);

  core.info(`Git committer name set to '${committer.name}'`);
  core.info(`Git committer email set to '${committer.email}'`);

  // Update remote URL to use HTTPS token authentication
  // Note! Needed for local testing, but works for all use cases.
  // The url holds the token, so the command is not echoed and the log line
  // names the url without it
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  await exec.exec('git', ['remote', 'set-url', 'origin', remoteUrl], {
    silent: true
  });

  core.info(
    `Git remote URL set to 'https://x-access-token:[redacted]@github.com/${owner}/${repo}.git'`
  );
};
