import * as core from '@actions/core';
import {
  getRepositoryDefaultBranch,
  redactConfig
} from '@codeware/shared/util/github';

import type { ActionInputs } from '../schemas/action-inputs.schema';
import { type Config, ConfigSchema } from '../schemas/config.schema';

/**
 * Normalize action inputs.
 *
 * Default values are applied for optional inputs
 * and the configuration is validated by schema.
 *
 * @param inputs Action inputs
 * @returns Normalized configuration
 * @throws If configuration is invalid
 */
export const normalizeInputs = async (
  inputs: ActionInputs
): Promise<Config> => {
  const {
    infisicalClientId,
    infisicalClientSecret,
    infisicalProjectId,
    infisicalSite,
    mainBranch: mainBranchInput,
    token: tokenInput
  } = inputs;

  // Check token; if not provided, use GitHub token
  const token = tokenInput || (process.env['GITHUB_TOKEN'] as string);

  // Check main branch; if not provided, get default branch
  const mainBranch =
    mainBranchInput || (await getRepositoryDefaultBranch(token));

  // Build Infisical config if all values are provided
  const infisical: Config['infisical'] =
    infisicalClientId && infisicalClientSecret && infisicalProjectId
      ? {
          clientId: infisicalClientId,
          clientSecret: infisicalClientSecret,
          projectId: infisicalProjectId,
          site: infisicalSite || 'eu'
        }
      : undefined;

  const config: Config = {
    infisical,
    mainBranch,
    token
  };

  core.info(JSON.stringify(redactConfig(config), null, 2));

  // Validate and return the configuration
  return ConfigSchema.parse(config);
};
