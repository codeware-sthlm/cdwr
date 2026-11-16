import { EnvSchema } from '@codeware/app-headless/util/env-schema';
import { isDeployEnabled } from '@codeware/shared/util/pure';

import type { Environment } from '../../services/infisical';
import type { DeploymentsMap, SkippedDeployment } from '../../services/tenancy';

/** Apps analyzed on every run */
export const APPS = ['cms', 'headless', 'builder', 'umami'] as const;

/** Apps that deploy per tenant only, never as a host */
const TENANT_ONLY_APPS: readonly string[] = ['headless'];

/** State of a folder's `DEPLOY_ENABLED` secret */
export type FlagState = 'on' | 'off' | 'no flag' | 'invalid name';

/** The state a folder's own `DEPLOY_ENABLED` value puts it in */
export const flagStateOf = (value: string | undefined): FlagState => {
  if (value === undefined) return 'no flag';
  return isDeployEnabled(value) ? 'on' : 'off';
};

/** Keys the deploy sets on the headless app itself, not read from the tenant folder */
const HEADLESS_DEPLOY_SET: readonly string[] = ['TENANT_ID'];

/**
 * The variables the headless env schema requires that the deploy would not
 * deliver: neither set by the deploy nor in the tenant folder's env or
 * secrets. Names only, sorted.
 */
export function missingHeadlessKeys(entry: {
  env?: Record<string, string>;
  secrets?: Record<string, string>;
}): string[] {
  const present = new Set([
    ...HEADLESS_DEPLOY_SET,
    ...Object.keys(entry.env ?? {}),
    ...Object.keys(entry.secrets ?? {})
  ]);
  return Object.entries(EnvSchema.shape)
    .filter(([, field]) => !field.safeParse(undefined).success)
    .map(([key]) => key)
    .filter((key) => !present.has(key))
    .sort();
}

export interface TenantFlag {
  tenant: string;
  flag: FlagState;
  /** Headless only: required variables the deploy would not deliver, for a tenant that is on */
  missing?: string[];
}

export interface AppAnalysis {
  app: string;
  /** Whether the host deployment of the app (`/apps/<app>`) deploys, null for a tenant-only app */
  host: FlagState | null;
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
  reason === 'flag-off'
    ? 'off'
    : reason === 'invalid-name'
      ? 'invalid name'
      : 'no flag';

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
        ...enabled.flatMap((entry) =>
          entry.tenant === undefined
            ? []
            : [
                {
                  tenant: entry.tenant,
                  flag: 'on' as const,
                  ...(app === 'headless' && {
                    missing: missingHeadlessKeys(entry)
                  })
                }
              ]
        ),
        ...off.flatMap((entry) =>
          entry.tenant === undefined
            ? []
            : [{ tenant: entry.tenant, flag: skippedState(entry) }]
        )
      ].sort((a, b) => a.tenant.localeCompare(b.tenant));

      return {
        app,
        host: TENANT_ONLY_APPS.includes(app)
          ? null
          : enabled.some(({ tenant }) => tenant === undefined)
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
