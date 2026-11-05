import { arrayToRecord } from '@codeware/shared/util/misc';

import type { ActionInputs } from '../schemas/action-inputs.schema';
import {
  type DeploymentConfig,
  DeploymentConfigSchema
} from '../schemas/deployment-config.schema';

/**
 * Get deployment configuration from action inputs.
 *
 * Default values are applied for optional inputs
 * and the configuration is validated by schema.
 *
 * @param inputs Action inputs
 * @returns Deployment configuration
 * @throws If configuration is invalid
 */
export const getDeploymentConfig = (inputs: ActionInputs): DeploymentConfig => {
  const {
    env: envInput,
    flyApiToken,
    flyOrg,
    flyRegion,
    flyTraceCli,
    flyConsoleLogs,
    infisicalClientId,
    infisicalClientSecret,
    infisicalProjectId,
    infisicalSite,
    optOutDepotBuilder,
    secrets: secretsInput,
    apps,
    appDetails,
    token
  } = inputs;

  const env = arrayToRecord(envInput ?? []);
  const secrets = arrayToRecord(secretsInput ?? []);

  const config: DeploymentConfig = {
    env,
    fly: {
      token: flyApiToken || process.env['FLY_API_TOKEN'] || '',
      org: flyOrg || '',
      region: flyRegion || '',
      traceCLI: flyTraceCli ?? false,
      consoleLogs: flyConsoleLogs ?? false,
      optOutDepotBuilder: optOutDepotBuilder ?? false
    },
    secrets,
    apps,
    appDetails: appDetails ?? {},
    infisical:
      infisicalClientId && infisicalClientSecret && infisicalProjectId
        ? {
            clientId: infisicalClientId,
            clientSecret: infisicalClientSecret,
            projectId: infisicalProjectId,
            site: infisicalSite || 'eu'
          }
        : undefined,
    token
  };
  return DeploymentConfigSchema.parse(config);
};
