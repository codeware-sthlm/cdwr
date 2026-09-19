import {
  type AppTenantsMap,
  type InfisicalConfig,
  fetchAppTenants,
  fetchDeployRules
} from '@codeware/shared/feature/tenancy';

import { muted } from '../cli/muted';

import type { Environment } from './infisical';

export type { AppTenantsMap };
export { filterByDeployRules } from '@codeware/shared/feature/tenancy';

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

/** Which tenants deploy each app, as the deploy reads it; muted, the lib narrates */
export const appTenants = (
  config: InfisicalConfig,
  apps: string[]
): Promise<AppTenantsMap> => muted(() => fetchAppTenants(config, apps));

/** The DEPLOY_RULES the deploy applies */
export const deployRules = (
  config: InfisicalConfig
): ReturnType<typeof fetchDeployRules> => muted(() => fetchDeployRules(config));
