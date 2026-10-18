import { createClient, isNotFound } from '@codeware/shared/feature/infisical';
import { DEPLOY_ENABLED_KEY } from '@codeware/shared/util/pure';
import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  reported,
  resolveDatabaseUrl,
  runCmsScript,
  withDatabase
} from '../../services/database';
import {
  DEPLOYED,
  environmentInput,
  previewAppInput
} from '../../services/environment';
import { flyAppName, listAppNames, pullRequestOf } from '../../services/fly';
import {
  dispatchWorkflow,
  listWorkflowRuns,
  pullRequestBranch,
  viewRun
} from '../../services/github';
import {
  type Environment,
  readDeployFlag,
  readSecrets,
  setInfisicalSecret
} from '../../services/infisical';
import { sleep } from '../../services/shell';
import {
  applyTenantTeam,
  gatherTenantTeam,
  recordTeamId,
  requireAdmin
} from '../../services/stats-team';
import {
  type TenantTeamInput,
  type TenantTeamPlan,
  planTenantTeam,
  teamMissingAdvice
} from '../../services/stats-team.logic';
import { listTenantRows } from '../../services/tenant-rows';
import {
  type UmamiConnection,
  createWebsite,
  getWebsite,
  listShares,
  listTeamWebsites,
  newShareSlug,
  readUmamiProvisioning,
  setShare
} from '../../services/umami';

import {
  type AppKind,
  DEPLOY_WORKFLOW,
  type FlagPlan,
  type FlipOutcome,
  type Folder,
  type KeyPlan,
  type StatsPlan,
  TENANT_APPS,
  type TenantRow,
  cmsPaused,
  conflictMessage,
  deployArgs,
  flagActionOf,
  flipsStatus,
  folderPath,
  normalizeDomain,
  pausedMessage,
  pickShare,
  planFlyAppsToDeploy,
  planFolders,
  provisionSteps,
  reasonSkipped,
  statsDomain,
  statsStep,
  statsWrites,
  statusReportSchema,
  workspaceChoices
} from './provision.logic';
import { awaitLive } from './provision.wait';

type Connection = Awaited<ReturnType<typeof createClient>>;

const RETRY_HINT =
  'Run `cdwr tenant provision` again to finish - it only writes what is still missing.';

/** Rows the choices loader read, so the plan need not tunnel again */
let lastRows: { key: string; rows: TenantRow[] } | undefined;

/** Folder names directly under a path, cached per plan */
function namesInFactory(
  connection: Connection,
  environment: Environment
): (parent: string) => Promise<string[] | null> {
  const cache = new Map<string, string[] | null>();
  return async (parent: string) => {
    if (!cache.has(parent)) {
      try {
        const folders = await connection.client.folders().listFolders({
          environment,
          projectId: connection.projectId,
          path: parent
        });
        cache.set(
          parent,
          folders.map((folder) => folder.name)
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        cache.set(parent, null);
      }
    }
    return cache.get(parent) ?? null;
  };
}

/** Run states that have not started yet, and still wait for the branch's slot */
const NOT_STARTED = new Set(['queued', 'pending', 'requested', 'waiting']);

/**
 * Wait until a run started after `known` was listed is actually running.
 * The workflow shares one concurrency slot per branch and keeps a single
 * pending run: another run joining while one waits cancels the waiting one.
 */
async function waitUntilRunning(
  root: string,
  branch: string,
  known: Set<number>,
  timeoutMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(5_000);
    const runs = await listWorkflowRuns(
      root,
      DEPLOY_WORKFLOW,
      branch,
      20
    ).catch(() => []);
    const run = runs.find(({ id }) => !known.has(id));
    if (run && !NOT_STARTED.has(run.status)) return true;
  }
  return false;
}

/** What the write-back script reports */
const statsReportSchema = z.object({
  outcome: z.enum(['set', 'unchanged', 'conflict']).optional(),
  current: z.string().optional(),
  share: z.enum(['set', 'unchanged', 'conflict']).optional(),
  currentShare: z.string().optional()
});

/** The workspace's team plan with what it was planned from */
interface TeamWork {
  input: TenantTeamInput;
  plan: TenantTeamPlan;
}

/**
 * Looks up the workspace's Umami team and website without writing anything.
 * A Umami failure skips the step rather than failing the plan.
 */
async function planStats(
  environment: Environment,
  apps: ReadonlyArray<AppKind>,
  tenant: TenantRow,
  cmsFlyApp: string,
  onWaking: () => void
): Promise<{
  plan: StatsPlan;
  connection?: UmamiConnection;
  team?: TeamWork;
  error?: string;
}> {
  if (environment !== 'production')
    return { plan: { action: 'skip', reason: 'preview' } };
  if (!apps.includes('cms'))
    return { plan: { action: 'skip', reason: 'no-cms' } };

  try {
    const provisioning = await readUmamiProvisioning(environment);
    if (provisioning.status === 'unconfigured')
      return { plan: { action: 'skip', reason: 'unconfigured' } };
    const connection: UmamiConnection = {
      url: provisioning.url,
      apiKey: provisioning.apiKey,
      onWaking
    };
    const readerConnection = {
      ...connection,
      apiKey: provisioning.readApiKey
    };

    if (tenant.statsWebsiteId) {
      const known = await getWebsite(connection, tenant.statsWebsiteId);
      if (!known)
        return {
          plan: { action: 'unknown', id: tenant.statsWebsiteId },
          connection
        };
      const input = await gatherTenantTeam(
        connection,
        readerConnection,
        tenant
      );
      return {
        plan: {
          action: 'keep',
          id: known.id,
          shareId: pickShare(
            await listShares(connection, known.id),
            tenant.statsShareId
          )
        },
        connection,
        team: { input, plan: planTenantTeam(input) }
      };
    }

    const input = await gatherTenantTeam(connection, readerConnection, tenant);
    const team = { input, plan: planTenantTeam(input) };
    const domain = statsDomain(tenant, cmsFlyApp);
    // Only the tenant's own team is searched; without one the website is new
    const match =
      input.statsTeamId && !team.plan.problem
        ? (await listTeamWebsites(connection, input.statsTeamId)).find(
            (site) => normalizeDomain(site.domain) === domain
          )
        : undefined;
    return {
      plan: match
        ? {
            action: 'adopt',
            id: match.id,
            domain,
            shareId: pickShare(
              await listShares(connection, match.id),
              tenant.statsShareId
            )
          }
        : { action: 'create', name: tenant.name, domain },
      connection,
      team
    };
  } catch (error) {
    return {
      plan: { action: 'skip', reason: 'unreachable' },
      error: messageOf(error)
    };
  }
}

interface PlanData {
  environment: Environment;
  previewApp: string | undefined;
  deployment: string;
  apiKey: string;
  apps: AppKind[];
  connection: Connection;
  folders: Folder[];
  keysToWrite: AppKind[];
  flags: FlagPlan[];
  databaseUrl: string;
  tenantId: number;
  stats: StatsPlan;
  statsConnection: UmamiConnection | undefined;
  statsTeam: TeamWork | undefined;
  currentShareId: string | null;
  /** The workspace is a new signup that gets activated once its site is up */
  flip: boolean;
  /** A new signup that `--no-wait` leaves pending */
  skippedFlip: boolean;
  /** A new signup whose cms deployment is switched off */
  pausedFlip: boolean;
  changes: number;
}

/**
 * Sets up the workspace's Umami team, then creates or adopts its website in
 * that team and writes the ids back. Never throws: a failure is a warning with
 * a retry hint. Statistics are optional, so it never fails the provision itself.
 */
async function applyStats(
  ctx: Pick<Context, 'ui'>,
  {
    root,
    environment,
    databaseUrl,
    tenantId,
    deployment,
    stats,
    connection,
    team,
    currentShareId
  }: {
    root: string;
    environment: Environment;
    databaseUrl: string;
    tenantId: number;
    deployment: string;
    stats: StatsPlan;
    connection: UmamiConnection | undefined;
    team: TeamWork | undefined;
    /** The share slug the workspace already records */
    currentShareId: string | null;
  }
): Promise<{ action: StatsPlan['action']; id?: string; failed: boolean }> {
  if (
    !connection ||
    (stats.action !== 'keep' &&
      stats.action !== 'adopt' &&
      stats.action !== 'create')
  ) {
    return {
      action: stats.action,
      ...('id' in stats ? { id: stats.id } : {}),
      failed: false
    };
  }

  let failed = false;
  // Updated the moment the team exists, so a later failure still knows it
  let teamId = team?.input.statsTeamId ?? null;
  if (team?.plan.problem === 'team-missing' && teamId) {
    // The recorded id is never replaced here; a person clears it
    ctx.ui.warn(`Statistics team: ${teamMissingAdvice(teamId)}`);
    teamId = null;
    failed = true;
  } else if (team?.plan.steps.length) {
    try {
      // Checked before anything is created, so a refusal changes nothing
      if (team.plan.needsAdmin) await requireAdmin(connection);
      await ctx.ui.task(
        'Setting up the statistics team',
        () =>
          applyTenantTeam(
            connection,
            { deployment },
            team.plan,
            team.input,
            async (id) => {
              await recordTeamId(root, environment, databaseUrl, tenantId, id);
              teamId = id;
            }
          ),
        ({ done }) =>
          `Statistics team ready (${done.join(', ') || 'no changes'})`
      );
    } catch (error) {
      ctx.ui.warn(
        `Statistics team not set up: ${messageOf(error)} ${RETRY_HINT}`
      );
      failed = true;
    }
  }

  // A new website needs its team; an existing one is kept whatever happened to the move
  if (stats.action !== 'keep' && !teamId)
    return { action: stats.action, failed: true };

  // Nothing to write: the workspace already records this website's share
  if (stats.action === 'keep' && statsWrites(stats, currentShareId) === 0) {
    return { action: 'keep', id: stats.id, failed };
  }

  try {
    const done = await ctx.ui.task(
      'Setting up the statistics website',
      async () => {
        let action: 'keep' | 'adopt' | 'create' = 'adopt';
        let id: string;
        let shareId: string | null = null;
        if (stats.action === 'keep') {
          action = 'keep';
          id = stats.id;
          shareId = stats.shareId;
        } else if (stats.action === 'adopt') {
          id = stats.id;
          shareId = stats.shareId;
        } else {
          // Checked again right before creating: the site may have appeared since the plan
          const existing = (
            await listTeamWebsites(connection, teamId as string)
          ).find((site) => normalizeDomain(site.domain) === stats.domain);
          if (existing) {
            id = existing.id;
          } else {
            action = 'create';
            id = (
              await createWebsite(connection, {
                name: stats.name,
                domain: stats.domain,
                teamId: teamId as string
              })
            ).id;
          }
        }

        // A recorded slug Umami has lost is created again as it was
        shareId ??= await setShare(
          connection,
          id,
          currentShareId ?? newShareSlug()
        );

        const { stdout } = await withDatabase(databaseUrl, (url) =>
          runCmsScript(
            root,
            'set-tenant-stats-website.ts',
            environment,
            {
              PROVISION_DATABASE_URL: url,
              STATS_TENANT_ID: String(tenantId),
              STATS_WEBSITE_ID: id,
              STATS_SHARE_ID: shareId
            },
            // Safe to repeat: a second run finds the same id and reports `unchanged`
            { reports: 'STATS_WEBSITE_SET' }
          )
        );
        const json = reported(stdout, 'STATS_WEBSITE_SET');
        if (!json) throw new Error('The write-back script reported no result');
        const result = statsReportSchema.parse(JSON.parse(json));
        if (result.outcome === 'conflict') {
          throw new Error(
            `The workspace already holds statistics website ${result.current}, so ${id} was not written`
          );
        }
        if (result.share === 'conflict') {
          throw new Error(
            `The workspace already holds share link ${result.currentShare}, so ${shareId} was not written`
          );
        }
        return { action, id };
      },
      ({ id }) => `Statistics website ${id} ready with a share link`
    );
    return { ...done, failed };
  } catch (error) {
    ctx.ui.warn(`Statistics website not set up: ${messageOf(error)}`);
    return { action: stats.action, failed: true };
  }
}

/**
 * Flips a pending workspace to active. Never throws: a failure leaves the
 * workspace pending with a warning.
 */
async function applyFlip(
  ctx: Pick<Context, 'ui'>,
  {
    root,
    environment,
    databaseUrl,
    tenantId
  }: {
    root: string;
    environment: Environment;
    databaseUrl: string;
    tenantId: number;
  }
): Promise<'flipped' | 'unchanged' | 'left-pending'> {
  try {
    return await ctx.ui.task(
      'Activating the workspace',
      async () => {
        const { stdout } = await withDatabase(databaseUrl, (url) =>
          runCmsScript(
            root,
            'set-tenant-status.ts',
            environment,
            {
              PROVISION_DATABASE_URL: url,
              STATUS_TENANT_ID: String(tenantId)
            },
            // Safe to repeat: an active workspace reports `unchanged`
            { reports: 'TENANT_STATUS_SET' }
          )
        );
        const json = reported(stdout, 'TENANT_STATUS_SET');
        if (!json) throw new Error('The status script reported no result');
        const result = statusReportSchema.parse(JSON.parse(json));
        switch (result.outcome) {
          case 'set':
            return 'flipped' as const;
          case 'unchanged':
            return 'unchanged' as const;
          case 'conflict':
            throw new Error(
              `The workspace has status '${result.current}', so it was not changed`
            );
          case 'error':
            throw new Error(result.message);
        }
      },
      (result) =>
        result === 'flipped'
          ? 'Workspace is active'
          : 'Workspace was already active'
    );
  } catch (error) {
    ctx.ui.warn(`Workspace not activated: ${messageOf(error)}`);
    return 'left-pending';
  }
}

/**
 * Sets up a tenant in Infisical from what Payload already knows about it -
 * folders, then the API key its Fly apps authenticate with - and offers to
 * kick off the deployment. A new tenant folder is switched on with
 * `DEPLOY_ENABLED=true`; an existing non-true value is left as a pause.
 */
export default defineCommand({
  summary: "Set up a tenant's Infisical folders and API key from Payload",
  description:
    'Reads the workspace from Payload, creates the folders and key a deploy expects, then can trigger it.',
  danger: 'spends-money',
  needs: ['fly', 'infisical', 'gh'],
  inputs: {
    environment: environmentInput(DEPLOYED),
    previewApp: previewAppInput(),
    workspace: input.select<string>({
      prompt: 'Which workspace?',
      short: 'w',
      description: 'Deployment name of the workspace to provision',
      // The plan reads the same rows again; loading them here only to check a flag would double the tunnel
      trustFlag: true,
      choices: async (ctx, resolved) => {
        const environment = resolved['environment'] as Environment;
        const previewApp = resolved['previewApp'] as string | undefined;
        const databaseUrl = await resolveDatabaseUrl(environment, previewApp);
        const rows = await withDatabase(databaseUrl, (url) =>
          listTenantRows(ctx.root, environment, url)
        );
        lastRows = { key: `${environment}:${previewApp ?? ''}`, rows };
        for (const row of rows) {
          const reason = reasonSkipped(row);
          if (reason)
            ctx.ui.warn(`Skipped ${row.name} (${row.slug}): ${reason}`);
        }
        return workspaceChoices(rows);
      }
    }),
    apps: input.multiselect<AppKind>({
      prompt: 'Which apps?',
      description: 'Apps to provision for the workspace',
      short: 'a',
      initial: ['cms'],
      min: 1,
      choices: () => TENANT_APPS.map((app) => ({ value: app }))
    }),
    wait: input.boolean({
      prompt: 'Wait for the deployment and activate a new signup?',
      description:
        'Wait for the cms to be deployed and healthy, then activate a pending workspace; --no-wait skips both',
      short: 'W',
      flagOnly: true,
      initial: true
    }),
    skipWait: input.boolean({
      prompt: 'Skip waiting for the deployment?',
      description: 'Same as --no-wait',
      short: 'S',
      flagOnly: true,
      initial: false
    })
  },

  async plan(
    ctx,
    { environment, previewApp, workspace, apps, wait, skipWait }
  ) {
    const noWait = skipWait || !wait;
    const databaseUrl = await resolveDatabaseUrl(environment, previewApp);
    const cacheKey = `${environment}:${previewApp ?? ''}`;
    const rows =
      lastRows?.key === cacheKey
        ? lastRows.rows
        : await ctx.ui.task(
            'Reading workspaces from Payload',
            () =>
              withDatabase(databaseUrl, (url) =>
                listTenantRows(ctx.root, environment, url)
              ),
            (list) => `${list.length} workspace(s) found`
          );
    const tenant = rows.find((row) => row.deployment === workspace);
    if (!tenant?.deployment || !tenant.apiKey) {
      throw new Error(`Workspace '${workspace}' not found`);
    }
    const deployment = tenant.deployment;
    const apiKey = tenant.apiKey;

    const connection = await createClient({});

    const { folders, keys, flags } = await ctx.ui.task(
      'Reading what Infisical already holds',
      async () => {
        const folders = await planFolders(
          deployment,
          apps,
          namesInFactory(connection, environment)
        );
        const missing = new Set(folders.map(folderPath));
        const rows = await Promise.all(
          apps.map(async (app) => {
            const secretPath = `/tenants/${deployment}/apps/${app}`;
            const secrets = missing.has(secretPath)
              ? {}
              : await readSecrets(environment, secretPath);
            const stored = secrets['PAYLOAD_API_KEY'];
            // Only this folder's own flag counts; an imported one would hide a missing local flag
            const flag = missing.has(secretPath)
              ? undefined
              : await readDeployFlag(environment, secretPath);
            const key: KeyPlan = {
              app,
              action: !stored
                ? 'create'
                : stored === apiKey
                  ? 'matches'
                  : 'conflict'
            };
            const action = flagActionOf(flag);
            const plan: FlagPlan =
              action === 'paused'
                ? { app, action, value: flag }
                : { app, action };
            return { key, plan };
          })
        );
        return {
          folders,
          keys: rows.map(({ key }) => key),
          flags: rows.map(({ plan }) => plan)
        };
      },
      () => 'Plan ready'
    );

    const conflicts = keys
      .filter(({ action }) => action === 'conflict')
      .map(({ app }) => app);
    if (conflicts.length)
      throw new CliError(conflictMessage(deployment, conflicts));

    const keysToWrite = keys
      .filter(({ action }) => action === 'create')
      .map(({ app }) => app);

    const pullRequest = previewApp ? pullRequestOf(previewApp) : undefined;
    // Set while the lookup waits for a suspended Umami; the task line says so
    let woke = false;
    const {
      plan: stats,
      connection: statsConnection,
      team: statsTeam,
      error
    } = await ctx.ui.task(
      'Looking up the statistics website in Umami',
      () =>
        planStats(
          environment,
          apps,
          tenant,
          flyAppName(ctx.root, 'cms', deployment, pullRequest),
          () => {
            woke = true;
          }
        ),
      ({ plan }) =>
        woke ? `${statsStep(plan)} (after waking Umami)` : statsStep(plan)
    );
    const pendingCms = tenant.status === 'pending' && apps.includes('cms');
    const paused = cmsPaused(flags);
    const flip = flipsStatus(tenant, apps, !noWait, flags);
    const notes = [
      ...(pendingCms && paused
        ? [
            `The cms is paused, so ${tenant.name} stays pending after provisioning.`
          ]
        : []),
      ...(stats.action === 'unknown'
        ? [
            `Statistics website ${stats.id} is unknown to Umami. ${tenant.name} keeps it as it is; check the id in the workspace or in Umami.`
          ]
        : []),
      ...(error
        ? [`Statistics skipped, Umami could not be read: ${error}`]
        : [])
    ];

    return {
      steps: provisionSteps(
        deployment,
        folders,
        keys,
        flags,
        stats,
        flip,
        statsTeam?.plan.steps
      ),
      notes,
      target: { environment, name: deployment },
      data: {
        environment,
        previewApp,
        deployment,
        apiKey,
        apps,
        connection,
        folders,
        keysToWrite,
        flags,
        databaseUrl,
        tenantId: tenant.id,
        stats,
        statsConnection,
        statsTeam,
        currentShareId: tenant.statsShareId,
        flip,
        skippedFlip: noWait && pendingCms && !paused,
        pausedFlip: pendingCms && paused,
        changes:
          folders.length +
          keysToWrite.length +
          flags.filter(({ action }) => action === 'create').length +
          statsWrites(stats, tenant.statsShareId) +
          (statsTeam?.plan.steps.length ?? 0)
      } satisfies PlanData
    };
  },

  async apply(ctx, data) {
    const {
      environment,
      previewApp,
      deployment,
      apiKey,
      apps,
      connection,
      folders,
      keysToWrite,
      flags,
      databaseUrl,
      tenantId,
      stats,
      statsConnection,
      statsTeam,
      currentShareId,
      flip,
      skippedFlip,
      pausedFlip,
      changes
    } = data;
    const { client, projectId } = connection;

    for (const folder of folders) {
      await ctx.ui.task(`Creating ${folderPath(folder)}`, async () => {
        try {
          await client.folders().create({
            environment,
            projectId,
            path: folder.parent,
            name: folder.name
          });
        } catch (error) {
          throw new CliError(messageOf(error), EXIT.failed, RETRY_HINT);
        }
      });
    }

    // Checked again right before writing, and created rather than updated: a
    // key that appeared after the plan was shown is never overwritten
    const written: AppKind[] = [];
    for (const app of keysToWrite) {
      const secretPath = `/tenants/${deployment}/apps/${app}`;
      const status = await ctx.ui.task(
        `Setting PAYLOAD_API_KEY in ${secretPath}`,
        async () => {
          const stored = (await readSecrets(environment, secretPath))[
            'PAYLOAD_API_KEY'
          ];
          if (stored === apiKey) return 'matches' as const;
          if (stored) {
            throw new CliError(
              `A different PAYLOAD_API_KEY was written to ${secretPath} after the plan was shown, so nothing was overwritten.\nIf this workspace's key is the one to keep, use \`cdwr tenant rotate-key\`.`
            );
          }
          await setInfisicalSecret({
            environment,
            path: secretPath,
            key: 'PAYLOAD_API_KEY',
            value: apiKey
          });
          return 'created' as const;
        },
        (result) =>
          result === 'matches'
            ? `${secretPath} already matches`
            : `${secretPath} created`
      );
      if (status === 'created') written.push(app);
    }

    // Created like the key: a flag that appeared after the plan is never overwritten
    for (const { app } of flags.filter(({ action }) => action === 'create')) {
      const secretPath = `/tenants/${deployment}/apps/${app}`;
      await ctx.ui.task(
        `Setting ${DEPLOY_ENABLED_KEY} in ${secretPath}`,
        async () => {
          const stored = await readDeployFlag(environment, secretPath);
          if (stored !== undefined) return 'kept' as const;
          await setInfisicalSecret({
            environment,
            path: secretPath,
            key: DEPLOY_ENABLED_KEY,
            value: 'true'
          });
          return 'created' as const;
        },
        (result) =>
          result === 'kept'
            ? `${secretPath} already has a flag`
            : `${secretPath} enabled`
      );
    }

    const paused = flags.filter(({ action }) => action === 'paused');
    if (paused.length) {
      ctx.ui.warn(pausedMessage(environment, deployment, paused));
    }
    const pausedApps = new Set(paused.map(({ app }) => app));

    const statistics = await applyStats(ctx, {
      root: ctx.root,
      environment,
      databaseUrl,
      tenantId,
      deployment,
      stats,
      connection: statsConnection,
      team: statsTeam,
      currentShareId
    });

    const pullRequest = previewApp ? pullRequestOf(previewApp) : undefined;
    const flyApps = apps
      .filter((app) => !pausedApps.has(app))
      .map((app) => ({
        app,
        flyApp: flyAppName(ctx.root, app, deployment, pullRequest)
      }));
    const existing = await listAppNames().catch(() => null);
    const toDeploy = planFlyAppsToDeploy(flyApps, existing, written);

    // A preview run has to build its own pull request, not the default branch
    const ref =
      toDeploy.length && pullRequest
        ? await pullRequestBranch(ctx.root, pullRequest).catch(() => undefined)
        : undefined;
    if (toDeploy.length && pullRequest && !ref) {
      ctx.ui.warn(
        `Could not read the branch of #${pullRequest} - start the deployment from that branch by hand.`
      );
    }
    // A manual run shares the concurrency slot of the branch it is started on
    const branch = ref ?? 'main';

    const started: string[] = [];
    // The cms run dispatched here, once dispatched and if GitHub named it
    let cmsDispatched = false;
    let cmsRunId: number | undefined;
    if (toDeploy.length && (!pullRequest || ref)) {
      const active = await listWorkflowRuns(
        ctx.root,
        DEPLOY_WORKFLOW,
        branch,
        20
      )
        .then((runs) => runs.filter(({ status }) => status !== 'completed'))
        .catch(() => null);
      if (active === null) {
        ctx.ui.warn(
          `Could not check for deployments running on ${branch} - a new run waits behind any that are.`
        );
      } else if (active.length) {
        ctx.ui.warn(
          `A deployment is already running on ${branch}. A new run waits behind it, and a push to ${branch} while it waits would cancel it.`
        );
      }

      const bills = toDeploy.some(({ exists }) => !exists)
        ? ' A new Fly app is created, and billed, by its first deployment.'
        : '';
      const deploy = ctx.flags.yes
        ? true
        : await ctx.ui.confirm({
            message: `Deploy ${toDeploy.map(({ flyApp }) => flyApp).join(', ')} now?${bills}`,
            initial: false
          });

      if (deploy) {
        for (const [index, { app, flyApp }] of toDeploy.entries()) {
          const known = new Set(
            (
              await listWorkflowRuns(
                ctx.root,
                DEPLOY_WORKFLOW,
                branch,
                20
              ).catch(() => [])
            ).map(({ id }) => id)
          );

          try {
            const dispatched = await ctx.ui.task(
              `Starting the deployment of ${flyApp}`,
              () =>
                dispatchWorkflow(ctx.root, DEPLOY_WORKFLOW, branch, {
                  app,
                  tenant: deployment,
                  environment,
                  ...(pullRequest ? { 'pr-number': String(pullRequest) } : {})
                })
            );
            started.push(flyApp);
            if (app === 'cms') {
              cmsDispatched = true;
              cmsRunId = dispatched.runId;
            }
          } catch (error) {
            ctx.ui.error(messageOf(error));
            continue;
          }

          const rest = toDeploy.slice(index + 1);
          if (!rest.length) break;

          // Starting the next run while this one waits would cancel this one
          const running = await ctx.ui.task(
            `Waiting for ${flyApp} to start before the next deployment`,
            () => waitUntilRunning(ctx.root, branch, known)
          );
          if (running) continue;

          ctx.ui.warn(
            `Not starting ${rest.map(({ flyApp: next }) => next).join(', ')} - a run started now would cancel the waiting one. Start it once ${flyApp} is running.`
          );
          break;
        }
      }
    }

    // A new signup goes live only after its cms is deployed and answering
    let flipOutcome: FlipOutcome = 'not-applicable';
    if (pausedFlip) {
      flipOutcome = 'cms-paused';
      ctx.ui.warn(
        `The cms is paused, so '${deployment}' stays pending. Enable it and run provision again.`
      );
    } else if (skippedFlip) {
      flipOutcome = 'no-wait';
      ctx.ui.warn(
        '--no-wait: the workspace stays pending. Run provision again once the site is up to activate it.'
      );
    } else if (flip) {
      const cmsFlyApp = flyApps.find(({ app }) => app === 'cms')?.flyApp;
      const cmsToDeploy = toDeploy.some(({ app }) => app === 'cms');
      let reason: string | undefined;
      if (!cmsFlyApp) {
        reason = 'the cms is paused';
      } else if (cmsToDeploy && !cmsDispatched) {
        reason = 'the cms deployment was not started';
      } else if (cmsDispatched && cmsRunId === undefined) {
        reason = 'the dispatch returned no run id';
      } else {
        const live = await ctx.ui.task(
          `Waiting for ${cmsFlyApp} to be deployed and healthy`,
          () =>
            awaitLive({
              runId: cmsRunId,
              getRun: (id) => viewRun(ctx.root, id),
              healthUrl: `https://${cmsFlyApp}.fly.dev/api/health`
            }),
          (result) =>
            result.live ? `${cmsFlyApp} is healthy` : 'Not healthy in time'
        );
        if (live.live) {
          flipOutcome = await applyFlip(ctx, {
            root: ctx.root,
            environment,
            databaseUrl,
            tenantId
          });
        } else {
          reason = live.reason;
        }
      }
      if (reason) {
        flipOutcome = 'left-pending';
        ctx.ui.warn(
          `Left pending: ${reason}. Run provision again once the site is up.`
        );
      }
    }

    const next = [
      ...toDeploy
        .filter(({ flyApp }) => !started.includes(flyApp))
        .map(
          ({ app, flyApp, exists }) =>
            `${exists ? `Redeploy ${flyApp} so it gets the new key` : `Deploy to create ${flyApp}`}: gh ${deployArgs(
              environment,
              deployment,
              app,
              pullRequest,
              ref ?? (pullRequest ? `<branch of #${pullRequest}>` : undefined)
            ).join(' ')}`
        ),
      ...(started.length
        ? [`Follow the deployment: gh run list --workflow=${DEPLOY_WORKFLOW}`]
        : []),
      ...(statistics.failed ? [RETRY_HINT] : []),
      "Add the workspace's domains and request certificates in its Domains panel.",
      "Confirm the result in the workspace's Infisical setup panel."
    ];

    // Provisioning can succeed while the app is still not deployed; the
    // summary says which, rather than a plain success for half the job
    const notDeployed = toDeploy.length > started.length;
    const partial = notDeployed || flipOutcome === 'left-pending';
    const done = changes
      ? `Provisioned '${deployment}' in ${environment}`
      : `'${deployment}' was already provisioned in ${environment}`;

    const outcome = notDeployed
      ? `${done} - not deployed yet, see the steps above`
      : started.length
        ? `${done}, and its deployment has started`
        : done;
    const activation =
      flipOutcome === 'flipped'
        ? ', workspace activated'
        : flipOutcome === 'left-pending' ||
            flipOutcome === 'no-wait' ||
            flipOutcome === 'cms-paused'
          ? ', workspace left pending'
          : '';

    return {
      summary: outcome + activation,
      partial,
      next,
      json: {
        deployment,
        environment,
        apps,
        written,
        toDeploy: toDeploy.map(({ flyApp }) => flyApp),
        started,
        flagsWritten: flags
          .filter(({ action }) => action === 'create')
          .map(({ app }) => app),
        paused: paused.map(({ app }) => app),
        statistics: {
          action: statistics.action,
          ...(statistics.id ? { id: statistics.id } : {})
        },
        statusFlip: flipOutcome
      }
    };
  }
});
