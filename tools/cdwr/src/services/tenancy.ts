import {
  type DeploymentsMap,
  type InfisicalConfig,
  type SkippedDeployment,
  fetchDeployments
} from '@codeware/shared/feature/tenancy';

import { muted } from '../cli/muted';

import type { Environment } from './infisical';

export type { DeploymentsMap, SkippedDeployment };

/** The tenancy lib's client config from the loaded env */
export const tenancyConfig = (
  env: NodeJS.ProcessEnv,
  environment: Environment
): InfisicalConfig => ({
  environment,
  site: 'eu',
  clientId: env['INFISICAL_CLIENT_ID'] ?? '',
  clientSecret: env['INFISICAL_CLIENT_SECRET'] ?? '',
  projectId: env['INFISICAL_PROJECT_ID'] ?? ''
});

/** What the deploy ships per app, and what it skips; muted, the lib narrates */
export const deployments = (
  config: InfisicalConfig,
  apps: string[]
): Promise<{ deployments: DeploymentsMap; skipped: SkippedDeployment[] }> =>
  muted(() => fetchDeployments(config, apps));
