import {
  deploymentNameIssue,
  matchesDeployRule,
  parseDeployRule
} from '@codeware/shared/util/pure';

import type { Environment } from '../../services/infisical';

/** The workflow every deployment goes through, including one started here */
export const DEPLOY_WORKFLOW = 'fly-deployment.yml';

/** Apps a workspace can be deployed with, named as their Infisical folders */
export const TENANT_APPS = ['cms', 'web'] as const;

export type AppKind = (typeof TENANT_APPS)[number];

/** One workspace, as the listing script reports it */
export interface TenantRow {
  id: number;
  name: string;
  slug: string;
  deployment: string | null;
  apiKey: string | null;
}

/** A folder to create, named by its parent path */
export interface Folder {
  parent: string;
  name: string;
}

export const folderPath = ({ parent, name }: Folder): string =>
  `${parent === '/' ? '' : parent}/${name}`;

/** The SDK types metadata as a record; the API sends an array */
export const metadataOf = (
  value: unknown
): ReadonlyArray<{ key: string; value: string }> =>
  (Array.isArray(value) ? value : value ? [value] : []) as ReadonlyArray<{
    key: string;
    value: string;
  }>;

/** Why a workspace row cannot be provisioned, or `null` when it can */
export function reasonSkipped(tenant: TenantRow): string | null {
  if (!tenant.deployment) return 'no deployment name';
  if (!tenant.apiKey) return 'no API key';
  if (deploymentNameIssue(tenant.deployment)) return 'invalid deployment name';
  return null;
}

/** Names of the folders directly under a path, or `null` when the path itself is missing */
export type NamesIn = (parent: string) => Promise<string[] | null>;

/**
 * Work out which folders are missing for a set of apps, without writing
 * anything. A folder the deploy reads is `/tenants/<deployment>/apps/<app>`,
 * so each app needs that whole chain; a folder that is itself about to be
 * created is never looked up, since nothing exists under it yet.
 */
export async function planFolders(
  deployment: string,
  apps: ReadonlyArray<AppKind>,
  namesIn: NamesIn
): Promise<Folder[]> {
  const missing: Folder[] = [];
  const isMissing = (target: string) =>
    missing.some((folder) => folderPath(folder) === target);

  for (const app of apps) {
    const chain: Folder[] = [
      { parent: '/', name: 'tenants' },
      { parent: '/tenants', name: deployment },
      { parent: `/tenants/${deployment}`, name: 'apps' },
      { parent: `/tenants/${deployment}/apps`, name: app }
    ];

    for (const folder of chain) {
      if (isMissing(folderPath(folder))) continue;
      if (
        isMissing(folder.parent) ||
        !(await namesIn(folder.parent))?.includes(folder.name)
      ) {
        missing.push(folder);
      }
    }
  }

  return missing;
}

export type KeyAction = 'create' | 'matches' | 'conflict';

export interface KeyPlan {
  app: AppKind;
  action: KeyAction;
}

/** The plan step lines shown before a provisioning write is confirmed */
export function provisionSteps(
  deployment: string,
  folders: ReadonlyArray<Folder>,
  keys: ReadonlyArray<KeyPlan>
): string[] {
  return [
    ...folders.map((folder) => `Create folder ${folderPath(folder)}`),
    ...keys.map(({ app, action }) =>
      action === 'create'
        ? `Set PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app}`
        : `Keep PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app} (already matches)`
    )
  ];
}

/** The refusal message when a folder already holds a different key */
export function conflictMessage(
  deployment: string,
  conflicts: ReadonlyArray<AppKind>
): string {
  return [
    'These folders already hold a different PAYLOAD_API_KEY:',
    ...conflicts.map((app) => `  /tenants/${deployment}/apps/${app}`),
    '',
    'A running app may authenticate with it, so nothing was written.',
    "If this workspace's key is the one to keep, use `cdwr tenant rotate-key`."
  ].join('\n');
}

export interface DeployRules {
  apps: string;
  tenants: string;
}

/**
 * What `DEPLOY_RULES` must still allow before a deployment ships these apps.
 * `rules` is `null` when the secret could not be read.
 */
export function deployRuleGaps(
  environment: Environment,
  deployment: string,
  apps: ReadonlyArray<AppKind>,
  rules: DeployRules | null
): string[] {
  if (!rules) {
    return [
      `DEPLOY_RULES in ${environment} could not be read - check that it deploys '${deployment}'.`
    ];
  }

  const gaps: string[] = [];

  if (!matchesDeployRule(deployment, parseDeployRule(rules.tenants))) {
    gaps.push(
      `Add '${deployment}' to the tenants rule of DEPLOY_RULES in ${environment} (now: ${rules.tenants}).`
    );
  }

  const excluded = apps.filter(
    (app) => !matchesDeployRule(app, parseDeployRule(rules.apps))
  );
  if (excluded.length) {
    gaps.push(
      `Add ${excluded.join(', ')} to the apps rule of DEPLOY_RULES in ${environment} (now: ${rules.apps}).`
    );
  }

  return gaps;
}

export interface FlyAppCheck {
  app: AppKind;
  flyApp: string;
  exists: boolean;
}

/**
 * The Fly apps a deployment has to reach: those that do not exist yet, and
 * existing ones whose key was just written - the deployment is what copies a
 * tenant's secrets onto its Fly app, so an app left behind by a failed run
 * would otherwise never get the key. `existing` is `null` when the list of
 * Fly apps could not be read, which treats every app as new rather than none.
 */
export function planFlyAppsToDeploy(
  apps: ReadonlyArray<{ app: AppKind; flyApp: string }>,
  existing: string[] | null,
  written: ReadonlyArray<AppKind>
): FlyAppCheck[] {
  return apps
    .map(({ app, flyApp }) => ({
      app,
      flyApp,
      exists: existing?.includes(flyApp) ?? false
    }))
    .filter(({ app, exists }) => !exists || written.includes(app));
}

/**
 * `gh` arguments that deploy one tenant app and nothing else.
 *
 * Naming the app makes the workflow deploy its last released version without
 * waiting for a version bump; naming the tenant keeps every other tenant out.
 * A manual run builds the branch it is started on, so a preview has to name
 * its pull request's branch - `gh` starts on the default branch otherwise.
 */
export const deployArgs = (
  environment: Environment,
  deployment: string,
  app: AppKind,
  pullRequest: number | undefined,
  ref: string | undefined
): string[] => [
  'workflow',
  'run',
  DEPLOY_WORKFLOW,
  ...(ref ? ['--ref', ref] : []),
  '-f',
  `app=${app}`,
  '-f',
  `tenant=${deployment}`,
  '-f',
  `environment=${environment}`,
  ...(pullRequest ? ['-f', `pr-number=${pullRequest}`] : [])
];
