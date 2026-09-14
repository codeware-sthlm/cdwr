import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner
} from '@clack/prompts';
import {
  type Environment,
  createClient,
  isNotFound
} from '@codeware/shared/feature/infisical';
import {
  type DeployRulesSecret,
  deploymentNameIssue,
  matchesDeployRule,
  parseDeployRule,
  readDeployRules
} from '@codeware/shared/util/pure';
import * as dotenv from 'dotenv';

import { fly, flyAppName, workspaceRoot } from './fly-apps';
import {
  resolveDatabaseUrl,
  runCmsScript,
  selectPreviewApp,
  withDatabase
} from './tenant-database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env.infisical') });

const execFileAsync = promisify(execFile);

/** The workflow every deployment goes through, including one started here */
const DEPLOY_WORKFLOW = 'fly-deployment.yml';

/** Environments a workspace is deployed to; development reads `.env.local` */
const ENVIRONMENTS = [
  'production',
  'preview'
] as const satisfies ReadonlyArray<Environment>;

/** Apps a workspace can be deployed with, named as their Infisical folders */
const TENANT_APPS = ['cms', 'web'] as const;

type TenantApp = (typeof TENANT_APPS)[number];

/** One workspace, as the listing script reports it */
type TenantRow = {
  id: number;
  name: string;
  slug: string;
  deployment: string | null;
  apiKey: string | null;
};

/** A folder to create, named by its parent path */
type Folder = { parent: string; name: string };

type Client = Awaited<ReturnType<typeof createClient>>;

type Plan = Client & {
  /** Missing folders, parents first */
  folders: Array<Folder>;
  keys: Array<{ app: TenantApp; action: 'create' | 'matches' | 'conflict' }>;
};

const folderPath = ({ parent, name }: Folder) =>
  `${parent === '/' ? '' : parent}/${name}`;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The SDK types metadata as a record; the API sends an array */
const metadataOf = (value: unknown) =>
  (Array.isArray(value)
    ? value
    : value
      ? [value]
      : []) as DeployRulesSecret['secretMetadata'];

/** The listing carries every key, so only its marker may reach an error */
const redact = (output: string) =>
  output.replace(/^(TENANT_DEPLOYMENTS=).*$/gm, '$1<redacted>');

/** Read every workspace with its deployment name and key from Payload */
async function listTenants(
  environment: Environment,
  databaseUrl: string
): Promise<Array<TenantRow>> {
  const { stdout, stderr } = await runCmsScript(
    'list-tenant-deployments.ts',
    environment,
    { PROVISION_DATABASE_URL: databaseUrl }
  );

  const json = stdout.match(/^TENANT_DEPLOYMENTS=(.+)$/m)?.[1];

  if (!json) {
    throw new Error(
      [
        'Listing script did not report a result.',
        '',
        '--- stdout ---',
        redact(stdout.trim()) || '<empty>',
        '',
        '--- stderr ---',
        redact(stderr.trim()) || '<empty>'
      ].join('\n')
    );
  }

  return JSON.parse(json) as Array<TenantRow>;
}

/**
 * Work out what is missing, without writing anything.
 *
 * A folder the deploy reads is `/tenants/<deployment>/apps/<app>`, so each app
 * needs that whole chain. A key already in place is kept when it matches, and
 * refused when it does not: a different key may be what a running app uses.
 */
async function planProvisioning(
  environment: Environment,
  deployment: string,
  apps: Array<TenantApp>,
  apiKey: string
): Promise<Plan> {
  const connection = await createClient({});
  const { client, projectId } = connection;

  const listed = new Map<string, Array<string> | null>();

  const namesIn = async (parent: string) => {
    if (!listed.has(parent)) {
      try {
        const folders = await client
          .folders()
          .listFolders({ environment, projectId, path: parent });
        listed.set(
          parent,
          folders.map((folder) => folder.name)
        );
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        listed.set(parent, null);
      }
    }

    return listed.get(parent) ?? null;
  };

  const missing: Array<Folder> = [];
  const isMissing = (target: string) =>
    missing.some((folder) => folderPath(folder) === target);

  for (const app of apps) {
    const chain: Array<Folder> = [
      { parent: '/', name: 'tenants' },
      { parent: '/tenants', name: deployment },
      { parent: `/tenants/${deployment}`, name: 'apps' },
      { parent: `/tenants/${deployment}/apps`, name: app }
    ];

    for (const folder of chain) {
      if (isMissing(folderPath(folder))) {
        continue;
      }

      // Below a folder that is about to be created, nothing exists yet
      if (
        isMissing(folder.parent) ||
        !(await namesIn(folder.parent))?.includes(folder.name)
      ) {
        missing.push(folder);
      }
    }
  }

  const keys = await Promise.all(
    apps.map(async (app) => {
      const secretPath = `/tenants/${deployment}/apps/${app}`;

      if (isMissing(secretPath)) {
        return { app, action: 'create' as const };
      }

      // Read the way consumers do, through imports and expanded references
      const secrets = await client.secrets().listSecretsWithImports({
        environment,
        projectId,
        secretPath,
        expandSecretReferences: true,
        recursive: false
      });
      const stored = secrets.find(
        ({ secretKey }) => secretKey === 'PAYLOAD_API_KEY'
      )?.secretValue;

      return {
        app,
        action: !stored
          ? ('create' as const)
          : stored === apiKey
            ? ('matches' as const)
            : ('conflict' as const)
      };
    })
  );

  return { ...connection, folders: missing, keys };
}

/**
 * What `DEPLOY_RULES` must still allow before a deployment ships these apps.
 *
 * Read through the open client: the shared helper logs its own connection
 * line, which would land in the middle of the prompts.
 */
async function deployRuleGaps(
  environment: Environment,
  deployment: string,
  apps: Array<TenantApp>,
  { client, projectId }: Client
): Promise<Array<string>> {
  let rules: { apps: string; tenants: string } | null = null;

  try {
    const secrets = await client.secrets().listSecretsWithImports({
      environment,
      projectId,
      secretPath: '/',
      expandSecretReferences: true,
      recursive: false
    });
    const secret = secrets.find(
      ({ secretKey }) => secretKey === 'DEPLOY_RULES'
    );
    rules = secret
      ? readDeployRules({
          secretValue: secret.secretValue,
          secretMetadata: metadataOf(secret.secretMetadata)
        }).rules
      : null;
  } catch {
    rules = null;
  }

  if (!rules) {
    return [
      `DEPLOY_RULES in ${environment} could not be read - check that it deploys '${deployment}'.`
    ];
  }

  const gaps: Array<string> = [];

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

/**
 * The Fly apps a deployment has to reach: those that do not exist yet, and
 * existing ones whose key was just written - the deployment is what copies a
 * tenant's secrets onto its Fly app, so an app left behind by a failed run
 * would otherwise never get the key.
 */
async function flyAppsToDeploy(
  deployment: string,
  apps: Array<TenantApp>,
  pullRequest: string | undefined,
  written: Array<TenantApp>
): Promise<Array<{ app: TenantApp; flyApp: string; exists: boolean }>> {
  // When the list cannot be read, every app is treated as new rather than none
  const existing = await fly.apps
    .list()
    .then((list) => list.map(({ name }) => name))
    .catch(() => null);

  return apps
    .map((app) => {
      const flyApp = flyAppName(app, deployment, pullRequest);
      return { app, flyApp, exists: existing?.includes(flyApp) ?? false };
    })
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
const deployArgs = (
  environment: Environment,
  deployment: string,
  app: TenantApp,
  pullRequest: string | undefined,
  ref: string | undefined
) => [
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

/** The branch a pull request builds from, or undefined when it cannot be read */
const pullRequestBranch = (pullRequest: string) =>
  execFileAsync(
    'gh',
    [
      'pr',
      'view',
      pullRequest,
      '--json',
      'headRefName',
      '--jq',
      '.headRefName'
    ],
    { cwd: workspaceRoot }
  )
    .then(({ stdout }) => stdout.trim() || undefined)
    .catch(() => undefined);

/** Run states that have not started yet, and still wait for the branch's slot */
const NOT_STARTED = new Set(['queued', 'pending', 'requested', 'waiting']);

type RunState = { databaseId: number; status: string };

/** Deployment runs on a branch, newest first, optionally one trigger only */
const deploymentRuns = (branch: string, event?: string) =>
  execFileAsync(
    'gh',
    [
      'run',
      'list',
      '--workflow',
      DEPLOY_WORKFLOW,
      '--branch',
      branch,
      ...(event ? ['--event', event] : []),
      '--limit',
      '20',
      '--json',
      'databaseId,status'
    ],
    { cwd: workspaceRoot }
  ).then(({ stdout }) => JSON.parse(stdout) as Array<RunState>);

/**
 * Wait until a run started after `known` was listed is actually running.
 *
 * The workflow shares one concurrency slot per branch and keeps a single
 * pending run: another run joining while one waits cancels the waiting one.
 * So the next app is only started once this one holds the slot.
 */
async function waitUntilRunning(
  branch: string,
  known: Set<number>,
  timeoutMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const runs = await deploymentRuns(branch, 'workflow_dispatch').catch(
      () => []
    );
    const run = runs.find(({ databaseId }) => !known.has(databaseId));

    if (run && !NOT_STARTED.has(run.status)) {
      return true;
    }
  }

  return false;
}

/**
 * Main interactive provisioning script
 */
async function main() {
  console.clear();
  intro('🧩  Provision tenant in Infisical');

  const environment = await select<Environment>({
    message: 'Select environment:',
    options: ENVIRONMENTS.map((env) => ({ value: env, label: env }))
  });

  if (isCancel(environment)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const s = spinner();

  const previewApp = environment === 'preview' ? await selectPreviewApp(s) : '';

  const databaseUrl = await resolveDatabaseUrl(previewApp, s);

  s.start('Reading workspaces from Payload...');

  let tenants: Array<TenantRow>;
  try {
    tenants = await withDatabase(
      databaseUrl,
      (dbUrl) => listTenants(environment, dbUrl),
      (attempt) =>
        s.message(`Tunnel dropped, rebuilding (attempt ${attempt + 1})...`),
      // Only reads, so any failure before a result is safe to try again
      (error) => /exited early|did not report a result/.test(messageOf(error))
    );
    s.stop(`Found ${tenants.length} workspace(s)`);
  } catch (error) {
    s.stop('Could not read workspaces');
    cancel(`Error: ${messageOf(error)}`);
    process.exit(1);
  }

  const reasonSkipped = (tenant: TenantRow) =>
    !tenant.deployment
      ? 'no deployment name'
      : !tenant.apiKey
        ? 'no API key'
        : deploymentNameIssue(tenant.deployment)
          ? 'invalid deployment name'
          : null;

  const skipped = tenants.filter((tenant) => reasonSkipped(tenant));
  const ready = tenants.filter((tenant) => !reasonSkipped(tenant));

  if (skipped.length) {
    log.info(
      [
        'Skipped - fix these in the admin first:',
        ...skipped.map(
          (tenant) =>
            `  ${tenant.name} (${tenant.slug}): ${reasonSkipped(tenant)}`
        )
      ].join('\n')
    );
  }

  if (!ready.length) {
    cancel('No workspace has both a deployment name and an API key');
    process.exit(0);
  }

  const tenantId = await select<number>({
    message: 'Select workspace to provision:',
    options: ready.map((tenant) => ({
      value: tenant.id,
      label: tenant.deployment ?? '',
      hint: `${tenant.name} (${tenant.slug})`
    }))
  });

  if (isCancel(tenantId)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const tenant = ready.find(({ id }) => id === tenantId);

  if (!tenant?.deployment || !tenant.apiKey) {
    cancel('Workspace not found');
    process.exit(1);
  }

  const deployment = tenant.deployment;
  const apiKey = tenant.apiKey;

  const apps = await multiselect<TenantApp>({
    message: 'Select apps to provision:',
    options: TENANT_APPS.map((app) => ({ value: app, label: app })),
    initialValues: ['cms'],
    required: true
  });

  if (isCancel(apps)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  s.start('Reading what Infisical already holds...');

  let plan: Plan;
  try {
    plan = await planProvisioning(environment, deployment, apps, apiKey);
    s.stop('Plan ready');
  } catch (error) {
    s.stop('Could not read Infisical');
    cancel(`Error: ${messageOf(error)}`);
    process.exit(1);
  }

  const conflicts = plan.keys.filter(({ action }) => action === 'conflict');

  if (conflicts.length) {
    note(
      [
        'These folders already hold a different PAYLOAD_API_KEY:',
        ...conflicts.map(({ app }) => `  /tenants/${deployment}/apps/${app}`),
        '',
        'A running app may authenticate with it, so nothing was written.',
        "If this workspace's key is the one to keep, use rotate-tenant-key."
      ].join('\n'),
      '⚠️  Cannot provision'
    );
    process.exit(1);
  }

  const keysToWrite = plan.keys.filter(({ action }) => action === 'create');
  // Apps whose key this run created, which an existing Fly app does not have yet
  const written: Array<TenantApp> = [];
  const changes = plan.folders.length + keysToWrite.length;

  if (changes) {
    note(
      [
        ...plan.folders.map(
          (folder) => `create folder        ${folderPath(folder)}`
        ),
        ...plan.keys.map(({ app, action }) =>
          action === 'create'
            ? `set PAYLOAD_API_KEY  /tenants/${deployment}/apps/${app}`
            : `keep PAYLOAD_API_KEY /tenants/${deployment}/apps/${app} (already matches)`
        )
      ].join('\n'),
      `Provision '${deployment}' (${tenant.name}) in ${environment}`
    );

    const proceed = await confirm({
      message: 'Write these changes to Infisical?',
      initialValue: false
    });

    if (isCancel(proceed) || !proceed) {
      cancel('Operation cancelled - nothing was written');
      process.exit(0);
    }

    const retry =
      'Run provision-tenant again to finish - it only writes what is still missing.';

    for (const folder of plan.folders) {
      s.start(`Creating ${folderPath(folder)}...`);

      try {
        await plan.client.folders().create({
          environment,
          projectId: plan.projectId,
          path: folder.parent,
          name: folder.name
        });
        s.stop(`${folderPath(folder)} created`);
      } catch (error) {
        s.stop(`${folderPath(folder)} failed`);
        cancel(`Error: ${messageOf(error)}\n\n${retry}`);
        process.exit(1);
      }
    }

    for (const { app } of keysToWrite) {
      const secretPath = `/tenants/${deployment}/apps/${app}`;
      s.start(`Setting PAYLOAD_API_KEY in ${secretPath}...`);

      try {
        // Checked again right before writing, and created rather than updated:
        // a key that appeared after the plan was shown is never overwritten
        const current = await plan.client.secrets().listSecretsWithImports({
          environment,
          projectId: plan.projectId,
          secretPath,
          expandSecretReferences: true,
          recursive: false
        });
        const stored = current.find(
          ({ secretKey }) => secretKey === 'PAYLOAD_API_KEY'
        )?.secretValue;

        if (stored === apiKey) {
          s.stop(`PAYLOAD_API_KEY already matches in ${secretPath}`);
          continue;
        }

        if (stored) {
          s.stop(`${secretPath} changed since the plan`);
          cancel(
            `A different PAYLOAD_API_KEY was written to ${secretPath} after the plan was shown, so nothing was overwritten.\nIf this workspace's key is the one to keep, use rotate-tenant-key.`
          );
          process.exit(1);
        }

        await plan.client.secrets().createSecret('PAYLOAD_API_KEY', {
          environment,
          projectId: plan.projectId,
          secretPath,
          secretValue: apiKey
        });
        s.stop(`PAYLOAD_API_KEY created in ${secretPath}`);
        written.push(app);
      } catch (error) {
        s.stop(`${secretPath} failed`);
        cancel(`Error: ${messageOf(error)}\n\n${retry}`);
        process.exit(1);
      }
    }
  }

  const pullRequest = previewApp.match(/-pr-(\d+)$/)?.[1];
  const toDeploy = await flyAppsToDeploy(
    deployment,
    apps,
    pullRequest,
    written
  );
  let gaps = await deployRuleGaps(environment, deployment, apps, plan);
  const started: Array<string> = [];

  // A deployment only ships what DEPLOY_RULES allows, so a run started before
  // the rule names this workspace would deploy nothing
  if (toDeploy.length && gaps.length) {
    note(
      [
        ...gaps,
        '',
        'A deployment only ships what DEPLOY_RULES allows, so it cannot start before that.'
      ].join('\n'),
      'Before deploying'
    );

    // Keep offering to read the rule again until it deploys the workspace, or
    // the answer is no - editing it happens outside this command
    let attempt = 0;

    while (gaps.length) {
      const check = await confirm({
        message: attempt
          ? 'DEPLOY_RULES still does not deploy it. Check again?'
          : `Have you updated DEPLOY_RULES in ${environment}? It is read again`,
        initialValue: false
      });

      if (isCancel(check) || !check) {
        break;
      }

      attempt++;
      gaps = await deployRuleGaps(environment, deployment, apps, plan);

      if (gaps.length) {
        log.warn(gaps.join('\n'));
      }
    }
  }

  // A preview run has to build its own pull request, not the default branch
  const ref =
    toDeploy.length && pullRequest
      ? await pullRequestBranch(pullRequest)
      : undefined;

  if (toDeploy.length && pullRequest && !ref) {
    log.warn(
      `Could not read the branch of #${pullRequest} - start the deployment from that branch by hand.`
    );
  }

  // A manual run shares the concurrency slot of the branch it is started on
  const branch = ref ?? 'main';

  if (toDeploy.length && !gaps.length && (!pullRequest || ref)) {
    const active = await deploymentRuns(branch)
      .then((runs) => runs.filter(({ status }) => status !== 'completed'))
      .catch(() => null);

    if (active === null) {
      log.warn(
        `Could not check for deployments running on ${branch} - a new run waits behind any that are.`
      );
    } else if (active.length) {
      log.warn(
        `A deployment is already running on ${branch}. A new run waits behind it, and a push to ${branch} while it waits would cancel it.`
      );
    }

    const deploy = await confirm({
      message: `Deploy ${toDeploy.map(({ flyApp }) => flyApp).join(', ')} now?${toDeploy.some(({ exists }) => !exists) ? ' A new Fly app is created, and billed, by its first deployment' : ''}`,
      initialValue: false
    });

    if (!isCancel(deploy) && deploy) {
      for (const [index, { app, flyApp }] of toDeploy.entries()) {
        const known = new Set(
          (
            await deploymentRuns(branch, 'workflow_dispatch').catch(() => [])
          ).map(({ databaseId }) => databaseId)
        );

        s.start(`Starting the deployment of ${flyApp}...`);

        try {
          await execFileAsync(
            'gh',
            deployArgs(environment, deployment, app, pullRequest, ref),
            { cwd: workspaceRoot }
          );
          started.push(flyApp);
          s.stop(`Deployment of ${flyApp} started`);
        } catch (error) {
          s.stop(`Could not start the deployment of ${flyApp}`);
          log.error(messageOf(error));
          continue;
        }

        const rest = toDeploy.slice(index + 1);

        if (!rest.length) {
          break;
        }

        // Starting the next run while this one waits would cancel this one
        s.start(`Waiting for ${flyApp} to start before the next deployment...`);
        const running = await waitUntilRunning(branch, known);

        if (running) {
          s.stop(`Deployment of ${flyApp} is running`);
          continue;
        }

        s.stop(`Deployment of ${flyApp} is still waiting`);
        log.warn(
          `Not starting ${rest.map(({ flyApp: next }) => next).join(', ')} - a run started now would cancel the waiting one. Start it once ${flyApp} is running.`
        );
        break;
      }
    }
  }

  const steps = [
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

  note(
    steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    'Still needs a person'
  );

  // Provisioning can succeed while the app is still not deployed; the last
  // line says which, rather than a green check for half the job
  const notDeployed = toDeploy.length > started.length;
  const done = changes
    ? `Provisioned '${deployment}' in ${environment}`
    : `'${deployment}' was already provisioned in ${environment}`;

  outro(
    notDeployed
      ? `⚠️  ${done} - not deployed yet, see the steps above`
      : started.length
        ? `✅  ${done}, and its deployment has started`
        : `✅  ${done}`
  );
}

// Export for use as a library
export { main as provisionTenantMain };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
