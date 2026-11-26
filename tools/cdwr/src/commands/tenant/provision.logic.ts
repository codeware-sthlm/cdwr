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
export const TENANT_APPS = ['cms', 'headless'] as const;

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

/** Shared values arrive by reference, the signature through `/apps/headless`'s own import */
export const HEADLESS_IMPORTS = ['/apps/headless'] as const;

/**
 * The cms folder imports the tenant's own shallow folder and `/apps/cms`, which
 * the cms loader reads today, the tenant folder beating `/apps/cms`.
 *
 * Order matters: the SDK's `listSecretsWithImports` keeps a folder's own
 * secrets, then takes the first import in the API's order that holds a key and
 * skips the same key in later ones (`secrets.find` before `push`). So the
 * tenant folder goes first, and is created first, as `/apps/cms` is written
 * after it.
 */
export const cmsImports = (deployment: string): string[] => [
  `/tenants/${deployment}`,
  '/apps/cms'
];

/** The folders an app's tenant folder imports; the headless ones do not depend on the deployment */
export const importsFor = (
  app: AppKind,
  deployment: string
): ReadonlyArray<string> =>
  app === 'headless' ? HEADLESS_IMPORTS : cmsImports(deployment);

export interface ImportPlan {
  app: AppKind;
  importPath: string;
  action: 'create' | 'present';
}

/**
 * The imports each app's tenant folder needs, given what it already imports
 * (`imported`, by app).
 */
export function planImports(
  apps: ReadonlyArray<AppKind>,
  deployment: string,
  imported: Partial<Record<AppKind, ReadonlyArray<string>>>
): ImportPlan[] {
  return apps.flatMap((app) =>
    importsFor(app, deployment).map((importPath) => ({
      app,
      importPath,
      action: (imported[app] ?? []).includes(importPath)
        ? ('present' as const)
        : ('create' as const)
    }))
  );
}

/** Where the cms reads the Umami key from, and the key it is set as on the app */
export const UMAMI_SOURCE = { path: '/integrations/umami', key: 'API_KEY' };

export type ReferenceKey = 'CORS_URLS' | 'UMAMI_API_KEY';

/** A reference secret of the cms folder: `create` when the key is absent from its own secrets */
export interface ReferencePlan {
  key: ReferenceKey;
  action: 'create' | 'present';
  /** The reference to write, or the value already stored */
  value: string;
}

/** A secret named by its folder and key */
export interface SecretSource {
  path: string;
  key: string;
}

/**
 * Infisical's cross-folder reference: `${<environment slug>.<folder>.<subfolder>.<KEY>}`.
 * The environment is the slug (`production`), the folders have no leading slash.
 */
export const secretReference = (
  environment: Environment,
  { path, key }: SecretSource
): string =>
  `\${${[environment, ...path.split('/').filter(Boolean), key].join('.')}}`;

/**
 * The references the cms folder gets, created only for keys absent from its
 * own secrets (`own`; imported ones do not count, and nothing is overwritten).
 * `cors` are the tenant's own secrets tagged `cors`; without any, nothing is
 * planned and the warning says so. The Umami key is referenced only when its
 * source exists.
 */
export function planReferences(
  environment: Environment,
  deployment: string,
  own: Readonly<Record<string, string>>,
  cors: ReadonlyArray<SecretSource>,
  umamiExists: boolean
): { references: ReferencePlan[]; warnings: string[] } {
  const references: ReferencePlan[] = [];
  const warnings: string[] = [];

  const stored = own['CORS_URLS'];
  if (stored !== undefined) {
    references.push({ key: 'CORS_URLS', action: 'present', value: stored });
  } else if (cors.length) {
    const unique = [
      ...new Set(cors.map((source) => secretReference(environment, source)))
    ].sort();
    references.push({
      key: 'CORS_URLS',
      action: 'create',
      value: unique.join(',')
    });
  } else {
    warnings.push(
      `No secret tagged 'cors' under /tenants/${deployment}, so CORS_URLS is not set for the cms. Tag the workspace's origin secret 'cors' and run provision again.`
    );
  }

  const umami = own['UMAMI_API_KEY'];
  if (umami !== undefined) {
    references.push({ key: 'UMAMI_API_KEY', action: 'present', value: umami });
  } else if (umamiExists) {
    references.push({
      key: 'UMAMI_API_KEY',
      action: 'create',
      value: secretReference(environment, UMAMI_SOURCE)
    });
  }

  return { references, warnings };
}

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
 * primary domain of the app it is named after (the cms, else headless),
 * otherwise that app's Fly hostname.
 */
export const statsDomain = (row: TenantRow, flyApp: string): string => {
  const primary = row.domains.find(
    ({ app, isPrimary }) => isPrimary && app === flyApp
  );
  return normalizeDomain(primary?.hostname ?? `${flyApp}.fly.dev`);
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

export type StatsSkipReason = 'preview' | 'unconfigured' | 'unreachable';

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
  team: ReadonlyArray<TeamStep> = [],
  imports: ReadonlyArray<ImportPlan> = [],
  references: ReadonlyArray<ReferencePlan> = []
): string[] {
  return [
    ...folders.map((folder) => `Create folder ${folderPath(folder)}`),
    ...keys.map(({ app, action }) =>
      action === 'create'
        ? `Set PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app}`
        : `Keep PAYLOAD_API_KEY in /tenants/${deployment}/apps/${app} (already matches)`
    ),
    // In write order: a tenant is enabled only once its imports exist
    ...imports.map(({ app, importPath, action }) => {
      const path = `/tenants/${deployment}/apps/${app}`;
      return action === 'create'
        ? `Import ${importPath} into ${path}`
        : `Keep import of ${importPath} in ${path} (already there)`;
    }),
    ...references.map(({ key, action, value }) => {
      const path = `/tenants/${deployment}/apps/cms`;
      return action === 'create'
        ? `Set ${key} in ${path} to ${value}`
        : `Keep ${key} in ${path} (already there)`;
    }),
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
