import {
  DEPLOY_ENABLED_KEY,
  deploymentNameIssue,
  isDeployEnabled
} from '@codeware/shared/util/pure';
import { z } from 'zod';

import type { Environment } from '../../services/infisical';
import { TEAM_STEP_TEXT, type TeamStep } from '../../services/stats-team.logic';

/** The workflow every deployment goes through, including one started here */
export const DEPLOY_WORKFLOW = 'fly-deployment.yml';

/** Apps a workspace can be deployed with, named as their Infisical folders */
export const TENANT_APPS = ['cms'] as const;

export type AppKind = (typeof TENANT_APPS)[number];

/** One workspace, as the listing script reports it */
export const tenantRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  // Older deployments answer without a status; their workspaces are live
  status: z.enum(['pending', 'active']).default('active'),
  deployment: z.string().nullable(),
  apiKey: z.string().nullable(),
  statsWebsiteId: z.string().nullable(),
  statsShareId: z.string().nullable(),
  // Older deployments answer without a team
  statsTeamId: z.string().nullable().optional(),
  domains: z.array(
    z.object({
      hostname: z.string(),
      app: z.string(),
      isPrimary: z.boolean()
    })
  )
});

export type TenantRow = z.infer<typeof tenantRowSchema>;

/** What the status write-back script reports */
export const statusReportSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('set') }),
  z.object({ outcome: z.literal('unchanged') }),
  z.object({ outcome: z.literal('conflict'), current: z.string() }),
  z.object({ outcome: z.literal('error'), message: z.string() })
]);

/**
 * The workspaces that can be provisioned as choices: new signups first, since
 * they are what waits for going live, then the rest in listed order.
 */
export function workspaceChoices(
  rows: ReadonlyArray<TenantRow>
): Array<{ value: string; hint: string }> {
  const ready = rows.flatMap((row) =>
    row.deployment && !reasonSkipped(row)
      ? [{ row, deployment: row.deployment }]
      : []
  );
  return [
    ...ready.filter(({ row }) => row.status === 'pending'),
    ...ready.filter(({ row }) => row.status !== 'pending')
  ].map(({ row, deployment }) => ({
    value: deployment,
    hint:
      row.status === 'pending'
        ? `${row.name} (${row.slug}) · new signup`
        : `${row.name} (${row.slug})`
  }));
}

/** Whether going live also activates the workspace: a new signup that gets its cms */
export const flipsStatus = (
  tenant: Pick<TenantRow, 'status'>,
  apps: ReadonlyArray<AppKind>,
  wait: boolean,
  flags: ReadonlyArray<FlagPlan> = []
): boolean =>
  tenant.status === 'pending' &&
  apps.includes('cms') &&
  wait &&
  !cmsPaused(flags);

/** Whether the plan leaves the cms deployment switched off */
export const cmsPaused = (flags: ReadonlyArray<FlagPlan>): boolean =>
  flags.some(({ app, action }) => app === 'cms' && action === 'paused');

export const FLIP_STEP =
  'Flip status pending → active after the deploy is healthy';

/** How the status flip ended, for the summary and `--json` */
export type FlipOutcome =
  | 'not-applicable'
  | 'no-wait'
  | 'cms-paused'
  | 'flipped'
  | 'unchanged'
  | 'left-pending';

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

/**
 * The recorded slug when Umami still lists it, `null` when it has lost it
 * (it is created again under the same name). Without a recorded slug, the
 * first listed.
 */
export const pickShare = (
  slugs: ReadonlyArray<string>,
  recorded: string | null
): string | null =>
  recorded ? (slugs.includes(recorded) ? recorded : null) : (slugs[0] ?? null);

export type StatsSkipReason =
  'preview' | 'unconfigured' | 'no-cms' | 'unreachable';

/** What to do about the workspace's Umami website */
export type StatsPlan =
  | { action: 'skip'; reason: StatsSkipReason }
  | { action: 'keep'; id: string; shareId: string | null }
  | { action: 'adopt'; id: string; domain: string; shareId: string | null }
  | { action: 'create'; name: string; domain: string }
  | { action: 'unknown'; id: string };

/**
 * Writes the plan makes for the website: 1 when it creates the website or its
 * share, or records an id or slug the workspace does not hold yet, otherwise 0
 */
export const statsWrites = (
  plan: StatsPlan,
  recorded: string | null
): 0 | 1 => {
  switch (plan.action) {
    case 'create':
    case 'adopt':
      return 1;
    case 'keep':
      return plan.shareId && plan.shareId === recorded ? 0 : 1;
    default:
      return 0;
  }
};

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
      return plan.shareId
        ? `Keep statistics website ${plan.id} and its share link`
        : `Keep statistics website ${plan.id}; add a share link`;
    case 'adopt':
      return `Adopt statistics website ${plan.domain} (${plan.id}) ${plan.shareId ? 'and its' : 'with a'} share link`;
    case 'create':
      return `Create statistics website ${plan.domain} in Umami with a share link`;
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
  stats?: StatsPlan,
  flip = false,
  team: ReadonlyArray<TeamStep> = []
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
    ...team.map((step) => `Statistics: ${TEAM_STEP_TEXT[step]}`),
    ...(stats ? [statsStep(stats)] : []),
    ...(flip ? [FLIP_STEP] : [])
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
