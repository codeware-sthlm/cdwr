import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  password as passwordPrompt,
  select,
  spinner
} from '@clack/prompts';
import {
  type Environment,
  EnvironmentSchema,
  deleteInfisicalSecret,
  setInfisicalSecret,
  withInfisical
} from '@codeware/shared/feature/infisical';
import * as dotenv from 'dotenv';

import { fly, flyAppName, startMachines } from './fly-apps';
import { fetchPreviewCmsApps } from './tenant-database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.infisical') });

const Environments = EnvironmentSchema.options;

/** The secret both apps read to decide whether their site is closed */
const KEY = 'SITE_GATE_PASSWORD';

/** Matches `site-gate.schema.ts`, which refuses to start the cms below this */
const MIN_LENGTH = 12;

type Deployment = {
  /** App folders under `/tenants/<id>/apps` */
  apps: Array<string>;
  /** Those of them already holding the gate password */
  gated: Array<string>;
};

/** What one app's gate looks like in both places it has to agree */
type AppState = {
  app: string;
  secretPath: string;
  /** The password is stored in Infisical, so a deploy would set it again */
  inInfisical: boolean;
  flyApp: string;
  /** Whether the running app carries it, which is what closes the site */
  onFly: 'missing' | 'set' | 'unreachable';
};

/**
 * Discover which apps each tenant deploys, and which already carry the gate.
 *
 * Only presence is read — a gate password is never printed, the same way the
 * Infisical panel reports key names and never values.
 */
async function fetchDeployments(
  environment: Environment
): Promise<Map<string, Deployment>> {
  const folders = await withInfisical({
    environment,
    filter: { path: '/tenants', recurse: true },
    groupByFolder: true
  });

  const deployments = new Map<string, Deployment>();
  const tenantAppPattern = /^\/tenants\/([^/]+)\/apps\/([^/]+)$/;

  for (const folder of folders ?? []) {
    const match = folder.path.match(tenantAppPattern);

    if (!match) {
      continue;
    }

    const [, tenantId, appName] = match;
    const entry = deployments.get(tenantId) ?? { apps: [], gated: [] };

    entry.apps.push(appName);

    if (folder.secrets.some(({ secretKey }) => secretKey === KEY)) {
      entry.gated.push(appName);
    }

    deployments.set(tenantId, entry);
  }

  return deployments;
}

/**
 * Whether the deployed app carries the gate password.
 *
 * An app that cannot be reached is reported rather than assumed open: a tenant
 * may have a folder for an app it has never deployed.
 */
async function readFlyState(flyApp: string): Promise<AppState['onFly']> {
  try {
    const secrets = await fly.secrets.list({ app: flyApp });
    return secrets.some(({ name }) => name === KEY) ? 'set' : 'missing';
  } catch {
    return 'unreachable';
  }
}

/**
 * Which pull request's preview to act on.
 *
 * The number only names Fly apps. With none deployed there is still a job to
 * do — writing Infisical closes the preview the moment it is deployed, which
 * is the whole point of gating a site before anyone can see it.
 */
async function selectPullRequest(
  s: ReturnType<typeof spinner>
): Promise<string | undefined> {
  s.start('Listing preview cms apps...');

  let apps: Array<string> = [];
  try {
    apps = await fetchPreviewCmsApps();
    s.stop(`Found ${apps.length} preview cms app(s)`);
  } catch (error) {
    s.stop('Could not list preview apps');
    log.warn(error instanceof Error ? error.message : String(error));
  }

  const numbers = [
    ...new Set(
      apps
        .map((app) => app.match(/-pr-(\d+)$/)?.[1])
        .filter((number): number is string => Boolean(number))
    )
  ];

  if (!numbers.length) {
    log.info(
      'Nothing is deployed to preview — Infisical only, so the next deploy arrives gated'
    );
    return undefined;
  }

  const selected = await select<string>({
    message: 'Which pull request?',
    options: [
      ...numbers.map((number) => ({ value: number, label: `PR #${number}` })),
      {
        value: '',
        label: 'None of them',
        hint: 'write Infisical only, for the next deploy'
      }
    ]
  });

  if (isCancel(selected)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  return selected || undefined;
}

/** A password nobody has to invent, in the alphabet a url can carry */
const generatePassword = () => randomBytes(18).toString('base64url');

/**
 * Close a site: Infisical first, so a redeploy cannot reopen it, then the
 * running apps, which is what visitors meet.
 */
async function closeGate(
  environment: Environment,
  states: Array<AppState>,
  value: string,
  s: ReturnType<typeof spinner>
): Promise<void> {
  for (const { secretPath } of states) {
    s.start(`Writing ${secretPath}...`);

    try {
      const { action } = await setInfisicalSecret({
        environment,
        path: secretPath,
        key: KEY,
        value
      });
      s.stop(`${secretPath} ${action}`);
    } catch (error) {
      s.stop(`${secretPath} failed`);
      cancel(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  const live = states.filter(({ onFly }) => onFly !== 'unreachable');

  // Stage everywhere, then apply, so a tenant's apps close together rather
  // than one restarting while the other is still open
  for (const { flyApp } of live) {
    s.start(`Staging the gate on ${flyApp}...`);

    try {
      await fly.secrets.set({ [KEY]: value }, { app: flyApp, stage: true });
      s.stop(`${flyApp} staged`);
    } catch (error) {
      s.stop(`${flyApp} could not be staged`);
      log.error(error instanceof Error ? error.message : String(error));
      note(
        [
          `Infisical holds the password, but '${flyApp}' did not take it, so`,
          `that site is still open. Finish it by hand:`,
          '',
          `  fly secrets set ${KEY}=<password> --app ${flyApp}`
        ].join('\n'),
        '⚠️  Staging incomplete'
      );
      process.exit(1);
    }
  }

  for (const { flyApp } of live) {
    s.start(`Closing ${flyApp}...`);

    try {
      // Fly can only update a started machine, and preview machines suspend
      await startMachines(flyApp);
      await fly.secrets.deploy(flyApp);
      s.stop(`${flyApp} is closed`);
    } catch (error) {
      s.stop(`${flyApp} did not restart`);
      log.error(error instanceof Error ? error.message : String(error));
      note(
        [
          `The password is staged on '${flyApp}' but its machines have not`,
          `taken it up, so the site is still open:`,
          '',
          `  fly secrets deploy --app ${flyApp}`
        ].join('\n'),
        '⚠️  Apply incomplete'
      );
      process.exit(1);
    }
  }
}

/**
 * Open a site: Infisical first for the same reason — a deploy that ran between
 * the two steps would otherwise put the password straight back.
 */
async function openGate(
  environment: Environment,
  states: Array<AppState>,
  s: ReturnType<typeof spinner>
): Promise<void> {
  for (const { secretPath } of states) {
    s.start(`Clearing ${secretPath}...`);

    try {
      const deleted = await deleteInfisicalSecret({
        environment,
        path: secretPath,
        key: KEY
      });
      s.stop(`${secretPath} ${deleted ? 'cleared' : 'held no password'}`);
    } catch (error) {
      s.stop(`${secretPath} failed`);
      cancel(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  for (const { flyApp } of states.filter(({ onFly }) => onFly === 'set')) {
    s.start(`Opening ${flyApp}...`);

    try {
      await startMachines(flyApp);
      // Unsetting releases the app, so the machines come back without it
      await fly.secrets.unset(KEY, { app: flyApp });
      s.stop(`${flyApp} is open`);
    } catch (error) {
      s.stop(`${flyApp} is still closed`);
      log.error(error instanceof Error ? error.message : String(error));
      note(
        [
          `Infisical no longer holds the password, but '${flyApp}' still runs`,
          `with it and keeps asking visitors for it:`,
          '',
          `  fly secrets unset ${KEY} --app ${flyApp}`
        ].join('\n'),
        '⚠️  Still gated'
      );
      process.exit(1);
    }
  }
}

/**
 * Open or close a tenant's site, in both places the gate lives.
 *
 * Infisical decides what a deploy sets; the Fly secret decides what the
 * running app does. Clearing one and not the other is the failure this exists
 * to prevent — a site that stays shut with nothing left to explain why.
 */
async function main() {
  console.clear();
  intro('🔒  Site gate');

  const environment = await select<Environment>({
    message: 'Select environment:',
    options: Environments.map((env) => ({ value: env, label: env }))
  });

  if (isCancel(environment)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const s = spinner();

  // Preview apps carry their pull request in the name
  const pullRequest =
    environment === 'preview' ? await selectPullRequest(s) : undefined;

  s.start(`Fetching tenants for ${environment} from Infisical...`);

  let deployments: Map<string, Deployment>;
  try {
    deployments = await fetchDeployments(environment);
    s.stop(`Found ${deployments.size} tenant(s)`);
  } catch (error) {
    s.stop('Failed to fetch tenants');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (deployments.size === 0) {
    cancel(`No tenant deployments found in ${environment}`);
    process.exit(0);
  }

  const tenantId = await select<string>({
    message: 'Select tenant:',
    options: [...deployments.entries()].map(([tenant, { apps, gated }]) => ({
      value: tenant,
      label: tenant,
      hint: gated.length
        ? `${apps.join(', ')} — gated: ${gated.join(', ')}`
        : `${apps.join(', ')} — open`
    }))
  });

  if (isCancel(tenantId)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const { apps, gated } = deployments.get(tenantId) ?? { apps: [], gated: [] };

  s.start('Reading the running apps...');

  const states: Array<AppState> = [];
  for (const app of apps) {
    // A preview with no pull request has no app to name, let alone reach
    const flyApp =
      environment === 'preview' && !pullRequest
        ? ''
        : flyAppName(app, tenantId, pullRequest);

    states.push({
      app,
      secretPath: `/tenants/${tenantId}/apps/${app}`,
      inInfisical: gated.includes(app),
      flyApp,
      onFly: flyApp ? await readFlyState(flyApp) : 'unreachable'
    });
  }

  s.stop('Read the running apps');

  const described = {
    missing: 'open',
    set: 'closed',
    unreachable: 'not deployed'
  } as const;

  note(
    states
      .map(
        ({ app, flyApp, inInfisical, onFly }) =>
          `${app}: ${described[onFly]}${flyApp ? ` (${flyApp})` : ''}\n` +
          `  Infisical ${inInfisical ? 'holds a password' : 'holds none'}`
      )
      .join('\n'),
    `${tenantId} in ${environment}`
  );

  // A site is closed only while the running app carries the password; what
  // Infisical holds decides what the next deploy does
  const anyClosed = states.some(({ onFly }) => onFly === 'set');
  const anyStored = states.some(({ inInfisical }) => inInfisical);

  const action = await select<'close' | 'open'>({
    message: 'What should happen?',
    options: [
      {
        value: 'close',
        label: anyClosed ? 'Set a new password' : 'Close the site',
        hint: 'writes Infisical, then restarts the apps with it'
      },
      {
        value: 'open',
        label: 'Open the site',
        hint:
          anyStored || anyClosed
            ? 'clears Infisical, then restarts the apps without it'
            : 'nothing to clear'
      }
    ]
  });

  if (isCancel(action)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  if (action === 'open') {
    const proceed = await confirm({
      message: `Open '${tenantId}' in ${environment} to everyone?`,
      initialValue: false
    });

    if (isCancel(proceed) || !proceed) {
      cancel('Operation cancelled - nothing was changed');
      process.exit(0);
    }

    await openGate(environment, states, s);
    outro(`✅  '${tenantId}' is open in ${environment}`);
    return;
  }

  const chosen = await select<'generate' | 'type'>({
    message: 'Which password?',
    options: [
      { value: 'generate', label: 'Generate one', hint: '24 characters' },
      { value: 'type', label: 'Type one', hint: `at least ${MIN_LENGTH}` }
    ]
  });

  if (isCancel(chosen)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  let value = generatePassword();

  if (chosen === 'type') {
    const typed = await passwordPrompt({
      message: 'Password visitors will be given:',
      validate: (input) =>
        (input ?? '').length < MIN_LENGTH
          ? `At least ${MIN_LENGTH} characters — the cms refuses to start below that`
          : undefined
    });

    if (isCancel(typed)) {
      cancel('Operation cancelled');
      process.exit(0);
    }

    value = typed;
  }

  const proceed = await confirm({
    message: `Close '${tenantId}' in ${environment} behind this password?`,
    initialValue: false
  });

  if (isCancel(proceed) || !proceed) {
    cancel('Operation cancelled - nothing was changed');
    process.exit(0);
  }

  await closeGate(environment, states, value, s);

  note(
    [
      `Password: ${value}`,
      '',
      `Shown once. Anyone who has it can read the site; everyone else meets`,
      `the gate. Setting a new one here logs out every visitor holding a`,
      `cookie, since the cookie is signed with the password.`
    ].join('\n'),
    'Share this with whoever should see the site'
  );

  outro(`✅  '${tenantId}' is closed in ${environment}`);
}

// Export for use as a library
export { main as siteGateMain };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
