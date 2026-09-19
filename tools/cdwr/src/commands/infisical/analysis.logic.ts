import type { AppTenantsMap } from '@codeware/shared/feature/tenancy';

import type { Environment } from '../../services/infisical';

/** Apps analyzed on every run */
export const APPS = ['cms', 'web'] as const;

export interface AppAnalysis {
  app: string;
  /** Tenants deploying this app, after deploy rules were applied */
  tenants: string[];
  /** App-level secrets under /apps/<app>, unmasked - the caller decides what to print */
  secrets: Record<string, string>;
}

export interface EnvironmentAnalysis {
  environment: Environment;
  apps: AppAnalysis[];
}

/**
 * Combine what deploy rules allow, which tenants use an app, and that app's
 * own secrets into one row per app, for one environment.
 */
export function summarize(
  environment: Environment,
  appTenants: AppTenantsMap,
  appSecrets: Record<string, Record<string, string>>
): EnvironmentAnalysis {
  return {
    environment,
    apps: APPS.map((app) => ({
      app,
      tenants: (appTenants[app] ?? []).map(({ tenant }) => tenant),
      secrets: appSecrets[app] ?? {}
    }))
  };
}
