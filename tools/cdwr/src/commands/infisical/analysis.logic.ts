import { EnvSchema as HeadlessEnvSchema } from '@codeware/app-headless/util/env-schema';
import { isDeployEnabled } from '@codeware/shared/util/pure';
import type { z } from 'zod';

import type { Environment } from '../../services/infisical';
import type { DeploymentsMap, SkippedDeployment } from '../../services/tenancy';

/**
 * Loaded untyped: the cms schema's types reach Payload's, whose Next globals
 * make `NODE_ENV` required on every `ProcessEnv` in this tool
 */
const CMS_ENV_SCHEMA = '@codeware/app-cms/util/env-schema' as string;
const { EnvSchema: CmsEnvSchema } = (await import(CMS_ENV_SCHEMA)) as {
  EnvSchema: z.ZodType;
};

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
 * Keys the deploy sets on a tenant cms app itself (`addOpinionatedEnv`, and
 * `DEPLOY_ENV` from the deploy's environment), not read from the tenant folder
 */
const CMS_DEPLOY_SET: readonly string[] = [
  'APP_NAME',
  'DEPLOY_ENV',
  'FLY_URL',
  'PR_NUMBER',
  'TENANT_ID'
];

/** An app whose tenant folders are checked against its env schema */
interface EnvCheck {
  schema: z.ZodType;
  deploySet: readonly string[];
}

const HEADLESS_CHECK: EnvCheck = {
  schema: HeadlessEnvSchema,
  deploySet: HEADLESS_DEPLOY_SET
};
const CMS_CHECK: EnvCheck = { schema: CmsEnvSchema, deploySet: CMS_DEPLOY_SET };

/** Apps whose enabled tenant folders are checked, with what each checks against */
const ENV_CHECKS: Record<string, EnvCheck | undefined> = {
  headless: HEADLESS_CHECK,
  cms: CMS_CHECK
};

/**
 * The keys a schema requires: those it rejects when parsing an empty
 * environment, which leaves out optional keys and keys with a default.
 * Refinements across keys only run once the shape passes, so they add none.
 */
function requiredKeys(schema: z.ZodType): string[] {
  const result = schema.safeParse({});
  if (result.success) return [];
  return [
    ...new Set(
      result.error.issues.flatMap(({ path }) =>
        typeof path[0] === 'string' ? [path[0]] : []
      )
    )
  ];
}

/**
 * The variables an app's env schema requires that the deploy would not
 * deliver: neither set by the deploy nor in the tenant folder's env or
 * secrets. Names only, sorted.
 */
function missingKeys(
  { schema, deploySet }: EnvCheck,
  entry: { env?: Record<string, string>; secrets?: Record<string, string> }
): string[] {
  const present = new Set([
    ...deploySet,
    ...Object.keys(entry.env ?? {}),
    ...Object.keys(entry.secrets ?? {})
  ]);
  return requiredKeys(schema)
    .filter((key) => !present.has(key))
    .sort();
}

type FolderEntry = Parameters<typeof missingKeys>[1];

/** Required headless variables the deploy of this tenant would not deliver */
export const missingHeadlessKeys = (entry: FolderEntry): string[] =>
  missingKeys(HEADLESS_CHECK, entry);

/** Required cms variables the deploy of this tenant would not deliver */
export const missingCmsKeys = (entry: FolderEntry): string[] =>
  missingKeys(CMS_CHECK, entry);

export interface TenantFlag {
  tenant: string;
  flag: FlagState;
  /** Cms and headless only: required variables the deploy would not deliver, for a tenant that is on */
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
      const check = ENV_CHECKS[app];

      const tenants: TenantFlag[] = [
        ...enabled.flatMap((entry) =>
          entry.tenant === undefined
            ? []
            : [
                {
                  tenant: entry.tenant,
                  flag: 'on' as const,
                  ...(check && { missing: missingKeys(check, entry) })
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
