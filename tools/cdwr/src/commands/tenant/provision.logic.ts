import {
  DEPLOY_ENABLED_KEY,
  deploymentNameIssue,
  isDeployEnabled
} from '@codeware/shared/util/pure';
import { z } from 'zod';

import type { Environment } from '../../services/infisical';

/** The workflow every deployment goes through, including one started here */
export const DEPLOY_WORKFLOW = 'fly-deployment.yml';

/** Apps a workspace can be deployed with, named as their Infisical folders */
export const TENANT_APPS = ['cms', 'web'] as const;

export type AppKind = (typeof TENANT_APPS)[number];

/** One workspace, as the listing script reports it */
export const tenantRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  deployment: z.string().nullable(),
  apiKey: z.string().nullable(),
  statsWebsiteId: z.string().nullable(),
  domains: z.array(
    z.object({
      hostname: z.string(),
      app: z.string(),
      isPrimary: z.boolean()
    })
  )
});

export type TenantRow = z.infer<typeof tenantRowSchema>;

/** A folder to create, named by its parent path */
export interface Folder {
  parent: string;
  name: string;
}

export const folderPath = ({ parent, name }: Folder): string =>
  `${parent === '/' ? '' : parent}/${name}`;

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

/**
 * What to do with `DEPLOY_ENABLED` of one app folder: `create` when absent,
 * `enabled` when already on, `paused` for any other value - a deliberate
 * pause that provisioning leaves alone.
 */
export type FlagAction = 'create' | 'enabled' | 'paused';

export interface FlagPlan {
  app: AppKind;
  action: FlagAction;
  /** The stored value of a paused flag */
  value?: string;
}

export const flagActionOf = (stored: string | undefined): FlagAction =>
  stored === undefined
    ? 'create'
    : isDeployEnabled(stored)
      ? 'enabled'
      : 'paused';

/** A domain as Umami and the workspace's domains list it: lowercase, no scheme, path or trailing dot */
export const normalizeDomain = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.+$/, '');

/**
 * The domain the workspace's statistics website is registered under: the
 * primary domain of its cms app, otherwise that app's Fly hostname.
 */
export const statsDomain = (row: TenantRow, cmsFlyApp: string): string => {
  const primary = row.domains.find(
    ({ app, isPrimary }) => isPrimary && app === cmsFlyApp
  );
  return normalizeDomain(primary?.hostname ?? `${cmsFlyApp}.fly.dev`);
};

export type StatsSkipReason =
  'preview' | 'unconfigured' | 'no-cms' | 'unreachable';

/** What to do about the workspace's Umami website */
export type StatsPlan =
  | { action: 'skip'; reason: StatsSkipReason }
  | { action: 'keep'; id: string }
  | { action: 'adopt'; id: string; domain: string }
  | { action: 'create'; name: string; domain: string }
  | { action: 'unknown'; id: string };

const SKIP_TEXT: Record<StatsSkipReason, string> = {
  preview: 'preview',
  unconfigured: 'Umami not configured',
  'no-cms': 'the cms is not among the apps',
  unreachable: 'Umami did not answer'
};

/** The plan line for the statistics website */
export const statsStep = (plan: StatsPlan): string => {
  switch (plan.action) {
    case 'skip':
      return `Statistics skipped: ${SKIP_TEXT[plan.reason]}`;
    case 'keep':
      return `Keep statistics website ${plan.id}`;
    case 'adopt':
      return `Adopt statistics website ${plan.domain} (${plan.id})`;
    case 'create':
      return `Create statistics website ${plan.domain} in Umami`;
    case 'unknown':
      return `Statistics website ${plan.id} is unknown to Umami; left as it is`;
  }
};

/** The plan step lines shown before a provisioning write is confirmed */
export function provisionSteps(
  deployment: string,
  folders: ReadonlyArray<Folder>,
  keys: ReadonlyArray<KeyPlan>,
  flags: ReadonlyArray<FlagPlan> = [],
  stats?: StatsPlan
): string[] {
  return [
    ...folders.map((folder) => `Create folder ${folderPath(folder)}`),
    ...keys.map(({ app, action }) =>
      action === 'create'
        ? `Set PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app}`
        : `Keep PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app} (already matches)`
    ),
    ...flags.map(({ app, action, value }) => {
      const path = `/tenants/${deployment}/apps/${app}`;
      if (action === 'create')
        return `Set ${DEPLOY_ENABLED_KEY}=true in ${path}`;
      return action === 'enabled'
        ? `Keep ${DEPLOY_ENABLED_KEY} in ${path} (already true)`
        : `Keep ${DEPLOY_ENABLED_KEY}=${value} in ${path} (paused)`;
    }),
    ...(stats ? [statsStep(stats)] : [])
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

/** The warning for apps whose tenant folder deliberately holds a non-true flag */
export function pausedMessage(
  environment: Environment,
  deployment: string,
  paused: ReadonlyArray<FlagPlan>
): string {
  return [
    `'${deployment}' stays paused in ${environment} for ${paused.map(({ app }) => app).join(', ')}:`,
    ...paused.map(
      ({ app, value }) =>
        `  /tenants/${deployment}/apps/${app} has ${DEPLOY_ENABLED_KEY}=${value}`
    ),
    `Set it to true to deploy; provisioning leaves it alone.`
  ].join('\n');
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
