import { isDeployEnabled } from '@codeware/shared/util/pure';

import type { Environment } from '../../services/infisical';
import type { DeploymentsMap, SkippedDeployment } from '../../services/tenancy';

/** Apps analyzed on every run */
export const APPS = ['cms', 'web', 'builder'] as const;

/** State of a folder's `DEPLOY_ENABLED` secret */
export type FlagState = 'on' | 'off' | 'no flag';

/** The state a folder's secrets put it in */
export const flagStateOf = (secrets: Record<string, string>): FlagState => {
  const value = secrets['DEPLOY_ENABLED'];
  if (value === undefined) return 'no flag';
  return isDeployEnabled(value) ? 'on' : 'off';
};

export interface TenantFlag {
  tenant: string;
  flag: FlagState;
}

export interface AppAnalysis {
  app: string;
  /** Whether the host deployment of the app (`/apps/<app>`) deploys */
  host: FlagState;
  /** Tenant folders of the app with their flag state, sorted by tenant */
  tenants: TenantFlag[];
  /** App-level secrets under /apps/<app>, unmasked - the caller decides what to print */
  secrets: Record<string, string>;
}

export interface EnvironmentAnalysis {
  environment: Environment;
  apps: AppAnalysis[];
}

const skippedState = ({ reason }: SkippedDeployment): FlagState =>
  reason === 'flag-off' ? 'off' : 'no flag';

/**
 * Combine what the deploy ships and skips, per app, with that app's own
 * secrets into one row per app, for one environment. Empty folders without a
 * flag are inert and absent from both lists.
 */
export function summarize(
  environment: Environment,
  deployments: DeploymentsMap,
  skipped: SkippedDeployment[],
  appSecrets: Record<string, Record<string, string>>
): EnvironmentAnalysis {
  return {
    environment,
    apps: APPS.map((app) => {
      const enabled = deployments[app] ?? [];
      const off = skipped.filter((entry) => entry.app === app);
      const hostSkip = off.find(({ tenant }) => tenant === undefined);

      const tenants: TenantFlag[] = [
        ...enabled.flatMap(({ tenant }) =>
          tenant === undefined ? [] : [{ tenant, flag: 'on' as const }]
        ),
        ...off.flatMap((entry) =>
          entry.tenant === undefined
            ? []
            : [{ tenant: entry.tenant, flag: skippedState(entry) }]
        )
      ].sort((a, b) => a.tenant.localeCompare(b.tenant));

      return {
        app,
        host: enabled.some(({ tenant }) => tenant === undefined)
          ? 'on'
          : hostSkip
            ? skippedState(hostSkip)
            : 'no flag',
        tenants,
        secrets: appSecrets[app] ?? {}
      };
    })
  };
}
