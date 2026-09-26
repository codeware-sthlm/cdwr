import { createClient, isNotFound } from '@codeware/shared/feature/infisical';
import { readDeployRules } from '@codeware/shared/util/pure';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  redactReported,
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
  listWorkflowRuns,
  pullRequestBranch,
  runWorkflow
} from '../../services/github';
import {
  type Environment,
  readSecrets,
  setInfisicalSecret
} from '../../services/infisical';
import { sleep } from '../../services/shell';

import {
  type AppKind,
  DEPLOY_WORKFLOW,
  type DeployRules,
  type Folder,
  type KeyAction,
  TENANT_APPS,
  type TenantRow,
  conflictMessage,
  deployArgs,
  deployRuleGaps,
  folderPath,
  metadataOf,
  planFlyAppsToDeploy,
  planFolders,
  provisionSteps,
  reasonSkipped
} from './provision.logic';

type Connection = Awaited<ReturnType<typeof createClient>>;

const RETRY_HINT =
  'Run `cdwr tenant provision` again to finish - it only writes what is still missing.';

/** Read every workspace with its deployment name and key from Payload */
/** Rows the choices loader read, so the plan need not tunnel again */
let lastRows: { key: string; rows: TenantRow[] } | undefined;

async function listTenantRows(
  root: string,
  environment: Environment,
  databaseUrl: string
): Promise<TenantRow[]> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'list-tenant-deployments.ts',
    environment,
    { PROVISION_DATABASE_URL: databaseUrl },
    { reports: 'TENANT_DEPLOYMENTS' }
  );
  const json = reported(stdout, 'TENANT_DEPLOYMENTS');
  if (!json) {
    throw new Error(
      [
        'Listing script did not report a result.',
        '',
        '--- stdout ---',
        redactReported(stdout, 'TENANT_DEPLOYMENTS').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
  return JSON.parse(json) as TenantRow[];
}

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

/** `DEPLOY_RULES` at the project root, or `null` when it cannot be read */
async function readRules(
  connection: Connection,
  environment: Environment
): Promise<DeployRules | null> {
  try {
    const secrets = await connection.client.secrets().listSecretsWithImports({
      environment,
      projectId: connection.projectId,
      secretPath: '/',
      expandSecretReferences: true,
      recursive: false
    });
    const secret = secrets.find(
      ({ secretKey }) => secretKey === 'DEPLOY_RULES'
    );
    if (!secret) return null;
    return readDeployRules({
      secretValue: secret.secretValue,
      secretMetadata: metadataOf(secret.secretMetadata)
    }).rules;
  } catch {
    return null;
  }
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

interface PlanData {
  environment: Environment;
  previewApp: string | undefined;
  deployment: string;
  apiKey: string;
  apps: AppKind[];
  connection: Connection;
  folders: Folder[];
  keysToWrite: AppKind[];
  changes: number;
}

/**
 * Sets up a tenant in Infisical from what Payload already knows about it -
 * folders, then the API key its Fly apps authenticate with - and offers to
 * kick off the deployment once DEPLOY_RULES allows it.
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
        return rows
          .filter((row) => !reasonSkipped(row))
          .map((row) => ({
            value: row.deployment as string,
            hint: `${row.name} (${row.slug})`
          }));
      }
    }),
    apps: input.multiselect<AppKind>({
      prompt: 'Which apps?',
      initial: ['cms'],
      min: 1,
      choices: () => TENANT_APPS.map((app) => ({ value: app }))
    })
  },

  async plan(ctx, { environment, previewApp, workspace, apps }) {
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

    const { folders, keys } = await ctx.ui.task(
      'Reading what Infisical already holds',
      async () => {
        const folders = await planFolders(
          deployment,
          apps,
          namesInFactory(connection, environment)
        );
        const missing = new Set(folders.map(folderPath));
        const keys = await Promise.all(
          apps.map(
            async (app): Promise<{ app: AppKind; action: KeyAction }> => {
              const secretPath = `/tenants/${deployment}/apps/${app}`;
              if (missing.has(secretPath)) return { app, action: 'create' };
              const stored = (await readSecrets(environment, secretPath))[
                'PAYLOAD_API_KEY'
              ];
              return {
                app,
                action: !stored
                  ? 'create'
                  : stored === apiKey
                    ? 'matches'
                    : 'conflict'
              };
            }
          )
        );
        return { folders, keys };
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

    return {
      steps: provisionSteps(deployment, folders, keys),
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
        changes: folders.length + keysToWrite.length
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

    const pullRequest = previewApp ? pullRequestOf(previewApp) : undefined;
    const flyApps = apps.map((app) => ({
      app,
      flyApp: flyAppName(ctx.root, app, deployment, pullRequest)
    }));
    const existing = await listAppNames().catch(() => null);
    const toDeploy = planFlyAppsToDeploy(flyApps, existing, written);

    let gaps = deployRuleGaps(
      environment,
      deployment,
      apps,
      await readRules(connection, environment)
    );

    if (toDeploy.length && gaps.length) {
      ctx.ui.warn(
        [
          ...gaps,
          '',
          'A deployment only ships what DEPLOY_RULES allows, so it cannot start before that.'
        ].join('\n')
      );

      // Keep offering to read the rule again until it deploys the workspace,
      // or the answer is no - editing it happens outside this command
      if (ctx.ui.interactive && !ctx.flags.nonInteractive) {
        let attempt = 0;
        while (gaps.length) {
          const check = await ctx.ui.confirm({
            message: attempt
              ? 'DEPLOY_RULES still does not deploy it. Check again?'
              : `Have you updated DEPLOY_RULES in ${environment}? It is read again`,
            initial: false
          });
          if (!check) break;
          attempt++;
          gaps = deployRuleGaps(
            environment,
            deployment,
            apps,
            await readRules(connection, environment)
          );
          if (gaps.length) ctx.ui.warn(gaps.join('\n'));
        }
      }
    }

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
    if (toDeploy.length && !gaps.length && (!pullRequest || ref)) {
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
            await ctx.ui.task(`Starting the deployment of ${flyApp}`, () =>
              runWorkflow(ctx.root, DEPLOY_WORKFLOW, branch, {
                app,
                tenant: deployment,
                environment,
                ...(pullRequest ? { 'pr-number': String(pullRequest) } : {})
              })
            );
            started.push(flyApp);
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

    const next = [
      ...gaps,
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
      "Add the workspace's domains and request certificates in its Domains panel.",
      "Confirm the result in the workspace's Infisical setup panel."
    ];

    // Provisioning can succeed while the app is still not deployed; the
    // summary says which, rather than a plain success for half the job
    const notDeployed = toDeploy.length > started.length;
    const done = changes
      ? `Provisioned '${deployment}' in ${environment}`
      : `'${deployment}' was already provisioned in ${environment}`;

    return {
      summary: notDeployed
        ? `${done} - not deployed yet, see the steps above`
        : started.length
          ? `${done}, and its deployment has started`
          : done,
      partial: notDeployed,
      next,
      json: {
        deployment,
        environment,
        apps,
        written,
        toDeploy: toDeploy.map(({ flyApp }) => flyApp),
        started,
        gaps
      }
    };
  }
});
