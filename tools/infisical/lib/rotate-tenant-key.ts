import { randomUUID } from 'crypto';
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
import {
  resolveDatabaseUrl,
  runCmsScript,
  selectPreviewApp,
  withDatabase
} from './tenant-database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.infisical') });

const Environments = EnvironmentSchema.options;

type TenantDeployment = {
  /** App folders holding a `PAYLOAD_API_KEY`, all of which must be updated */
  apps: Array<string>;
  /** Distinct key values found across those folders */
  apiKeys: Set<string>;
};

/**
 * Discover which apps each tenant deploys, from the `/tenants/<id>/apps/<app>`
 * folder structure. Every app folder holding a `PAYLOAD_API_KEY` has to be
 * updated, otherwise that deployment authenticates with the retired key.
 *
 * The key value is collected too - it is what identifies the Payload tenant.
 * The Infisical tenant id is a deployment name, not the tenant's slug.
 */
async function fetchTenantDeployments(
  environment: Environment
): Promise<Map<string, TenantDeployment>> {
  const folders = await withInfisical({
    environment,
    filter: { path: '/tenants', recurse: true },
    groupByFolder: true
  });

  const tenants = new Map<string, TenantDeployment>();
  const tenantAppPattern = /^\/tenants\/([^/]+)\/apps\/([^/]+)$/;

  for (const folder of folders ?? []) {
    const match = folder.path.match(tenantAppPattern);

    if (!match) {
      continue;
    }

    const [, tenantId, appName] = match;
    const apiKey = folder.secrets.find(
      ({ secretKey }) => secretKey === 'PAYLOAD_API_KEY'
    )?.secretValue;

    if (!apiKey) {
      continue;
    }

    const entry = tenants.get(tenantId) ?? { apps: [], apiKeys: new Set() };
    entry.apps.push(appName);
    entry.apiKeys.add(apiKey);
    tenants.set(tenantId, entry);
  }

  return tenants;
}

/**
 * Prove Infisical will accept an edit, before anything is rotated.
 *
 * Rotation writes Payload first and Infisical second, so a token that cannot
 * edit leaves the tenant holding a key nothing else knows. Checking up front
 * turns that into a refusal to start.
 *
 * It has to be a real edit of a real secret: writing `PAYLOAD_API_KEY` back
 * unchanged proves nothing, because a write that "fails" but leaves the stored
 * value matching is treated as success. So use a throwaway secret, change it,
 * confirm the change is visible, and remove it.
 */
async function assertInfisicalWritable(
  environment: Environment,
  secretPath: string
): Promise<void> {
  const key = 'ROTATION_WRITE_CHECK';
  const write = (value: string) =>
    setInfisicalSecret({ environment, path: secretPath, key, value });

  try {
    await write(`probe-${randomUUID()}`);

    // The edit, which is the permission rotation actually needs
    const expected = `probe-${randomUUID()}`;
    await write(expected);

    const stored = (
      await withInfisical({ environment, filter: { path: secretPath } })
    )?.find(({ secretKey }) => secretKey === key)?.secretValue;

    if (stored !== expected) {
      throw new Error('the edit did not take effect');
    }
  } catch (error) {
    throw new Error(
      `Infisical will not accept writes at ${secretPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    await deleteInfisicalSecret({ environment, path: secretPath, key });
  }
}

/**
 * Whether a failure happened before the script touched the tenant.
 *
 * The script reports `RESOLVED_TENANT` as soon as it has found the tenant and
 * `ROTATED_API_KEY` once it has written, so a failure carrying neither means
 * it never got past connecting - nothing was changed and retrying is safe.
 */
const isPreWriteFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    !message.includes('RESOLVED_TENANT=') &&
    !message.includes('ROTATED_API_KEY=') &&
    /exited early|did not report a result/.test(message)
  );
};

/**
 * Rotate the key in Payload via the local-api and return the new value
 */
async function rotateInPayload(
  environment: Environment,
  currentApiKey: string,
  databaseUrl: string,
  dryRun = false
): Promise<{ apiKey: string; slug: string }> {
  const { stdout, stderr } = await runCmsScript(
    'rotate-tenant-key.ts',
    environment,
    {
      ROTATE_DATABASE_URL: databaseUrl,
      ROTATE_CURRENT_API_KEY: currentApiKey,
      ROTATE_DRY_RUN: String(dryRun)
    }
  );

  const apiKey = stdout.match(/^ROTATED_API_KEY=(.+)$/m)?.[1]?.trim() ?? '';
  const slug = stdout.match(/^RESOLVED_TENANT=(.+)$/m)?.[1]?.trim();

  if (!slug || (!dryRun && !apiKey)) {
    // The key may already have been written and printed before whatever went
    // wrong here, and this output ends up on a console and in shell history.
    // Keep the marker, drop the value - `isPreWriteFailure` reads the marker
    // to decide whether a retry could repeat a write.
    const redact = (output: string) =>
      output.replace(/^(ROTATED_API_KEY=).*$/gm, '$1<redacted>');

    // Report both streams - the interesting part of a silent failure is
    // usually on stderr, and without it there is nothing to go on
    throw new Error(
      [
        'Rotation script did not report a result.',
        '',
        '--- stdout ---',
        redact(stdout.trim()) || '<empty>',
        '',
        '--- stderr ---',
        redact(stderr.trim()) || '<empty>'
      ].join('\n')
    );
  }

  return { apiKey, slug };
}

/**
 * Main interactive rotation script
 */
async function main() {
  console.clear();
  intro('🔑  Rotate tenant API key');

  const environment = await select<Environment>({
    message: 'Select environment:',
    options: Environments.map((env) => ({ value: env, label: env }))
  });

  if (isCancel(environment)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const s = spinner();

  // Preview has one database per pull request, so the app has to be named
  // before anything can be read from it
  const previewApp = environment === 'preview' ? await selectPreviewApp(s) : '';

  s.start(`Fetching tenants for ${environment} from Infisical...`);

  let tenants: Map<string, TenantDeployment>;
  try {
    tenants = await fetchTenantDeployments(environment);
    s.stop(`Found ${tenants.size} tenant(s)`);
  } catch (error) {
    s.stop('Failed to fetch tenants');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (tenants.size === 0) {
    cancel(`No tenants with a PAYLOAD_API_KEY found in ${environment}`);
    process.exit(0);
  }

  const tenantId = await select<string>({
    message: 'Select tenant to rotate:',
    options: [...tenants.entries()].map(([tenant, { apps }]) => ({
      value: tenant,
      label: tenant,
      hint: `${apps.join(', ')}`
    }))
  });

  if (isCancel(tenantId)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const { apps, apiKeys } = tenants.get(tenantId) ?? {
    apps: [],
    apiKeys: new Set<string>()
  };

  // The key identifies the tenant, so the folders disagreeing means we cannot
  // know which one the deployments actually authenticate with
  if (apiKeys.size > 1) {
    cancel(
      `The app folders under /tenants/${tenantId} hold different ` +
        `PAYLOAD_API_KEY values. Reconcile them before rotating.`
    );
    process.exit(1);
  }

  const [currentApiKey] = [...apiKeys];

  note(
    [
      `The Payload tenant using this key gets a new one, then Infisical is`,
      `updated for: ${apps.map((app) => `/tenants/${tenantId}/apps/${app}`).join(', ')}`,
      '',
      `'${tenantId}' is a deployment name - the tenant is resolved by its`,
      `current API key, and its Payload slug is reported once resolved.`,
      ...(previewApp
        ? [
            '',
            `Database is read from '${previewApp}', which is started first if`,
            `its machines are stopped.`
          ]
        : []),
      '',
      `The running deployments keep using the old key until they are`,
      `redeployed, so ${tenantId} serves errors until that completes.`
    ].join('\n'),
    'What happens next'
  );

  const databaseUrl = await resolveDatabaseUrl(previewApp, s);

  // Both stores have to be writable for a rotation to finish. Payload is
  // written first, so an Infisical token that cannot edit would leave the
  // tenant holding a key nothing else has - check before that can happen.
  s.start('Checking Infisical accepts writes...');

  try {
    for (const app of apps) {
      await assertInfisicalWritable(
        environment,
        `/tenants/${tenantId}/apps/${app}`
      );
    }
    s.stop('Infisical writes verified');
  } catch (error) {
    s.stop('Infisical is not writable');
    note(
      [
        error instanceof Error ? error.message : String(error),
        '',
        `Nothing was changed - Payload is untouched and the tenant still works.`,
        '',
        `Rotation writes to Infisical, so the credentials in`,
        `tools/infisical/.env.infisical need to create and edit secrets under`,
        `/tenants. A read-only token gets this far and then strands the tenant`,
        `on a key only Payload knows, which is why it is checked up front.`
      ].join('\n'),
      '⚠️  Cannot rotate'
    );
    process.exit(1);
  }

  // Resolve first, so the tenant being rotated is named before anything is
  // written. This connects on its own - see `withDatabase` for why the
  // connection is not held open across the prompt that follows.
  s.start('Resolving which Payload tenant holds this key...');

  let slug: string;
  try {
    ({ slug } = await withDatabase(
      databaseUrl,
      (dbUrl) => rotateInPayload(environment, currentApiKey, dbUrl, true),
      (attempt) =>
        s.message(`Tunnel dropped, rebuilding (attempt ${attempt + 1})...`),
      isPreWriteFailure
    ));
    s.stop(`Resolved to Payload tenant '${slug}'`);
  } catch (error) {
    s.stop('Could not resolve the tenant');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const proceed = await confirm({
    message: `Rotate '${tenantId}' → Payload tenant '${slug}' in ${environment}?`,
    initialValue: false
  });

  if (isCancel(proceed) || !proceed) {
    cancel('Operation cancelled - nothing was written');
    process.exit(0);
  }

  s.start(`Rotating key for '${slug}'...`);

  let rotated: { apiKey: string; slug: string };
  try {
    rotated = await withDatabase(
      databaseUrl,
      (dbUrl) => rotateInPayload(environment, currentApiKey, dbUrl),
      (attempt) =>
        s.message(`Tunnel dropped, rebuilding (attempt ${attempt + 1})...`),
      isPreWriteFailure
    );
    s.stop(`Payload tenant '${rotated.slug}' updated`);
  } catch (error) {
    s.stop('Rotation failed');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // From here the Payload key is already live — every Infisical write has to
  // land or the tenant stays broken with no way back to the old key.
  const failed: Array<string> = [];

  for (const app of apps) {
    const secretPath = `/tenants/${tenantId}/apps/${app}`;
    s.start(`Updating ${secretPath}...`);

    try {
      const { action } = await setInfisicalSecret({
        environment,
        path: secretPath,
        key: 'PAYLOAD_API_KEY',
        value: rotated.apiKey
      });
      s.stop(`${secretPath} ${action}`);
    } catch (error) {
      s.stop(`${secretPath} failed`);
      log.error(error instanceof Error ? error.message : String(error));
      failed.push(secretPath);
    }
  }

  if (failed.length) {
    note(
      [
        `Payload now expects the new key but these paths were not updated:`,
        ...failed.map((p) => `  ${p}`),
        '',
        `Set PAYLOAD_API_KEY manually before redeploying:`,
        `  ${rotated.apiKey}`
      ].join('\n'),
      '⚠️  Infisical is out of sync'
    );
    process.exit(1);
  }

  // A redeploy would not finish the job: the deployment only sets secrets that
  // are missing and skips any that already exist, so a rotated PAYLOAD_API_KEY
  // never reaches a running app that way. Write it to the Fly apps directly.
  const pullRequest = previewApp.match(/-pr-(\d+)$/)?.[1];
  const flyApps = apps.map((app) => ({
    app,
    flyApp: flyAppName(app, tenantId, pullRequest)
  }));

  // Stage everywhere first, then apply, so cms and web change together instead
  // of each restarting as its own secret lands
  const staged: Array<string> = [];

  for (const { app, flyApp } of flyApps) {
    s.start(`Staging PAYLOAD_API_KEY on ${flyApp}...`);

    try {
      await fly.secrets.set(
        { PAYLOAD_API_KEY: rotated.apiKey },
        { app: flyApp, stage: true }
      );
      staged.push(flyApp);
      s.stop(`${flyApp} staged`);
    } catch (error) {
      s.stop(`${flyApp} could not be staged`);
      log.error(error instanceof Error ? error.message : String(error));
      note(
        [
          `Infisical holds the new key, but '${flyApp}' (${app}) did not take`,
          `it. Nothing has been applied yet, so the tenant is still running on`,
          `the old key - finish the remaining apps by hand:`,
          '',
          `  fly secrets set PAYLOAD_API_KEY=<key> --app ${flyApp}`
        ].join('\n'),
        '⚠️  Staging incomplete'
      );
      process.exit(1);
    }
  }

  for (const flyApp of staged) {
    s.start(`Applying staged secret on ${flyApp}...`);

    try {
      // Fly can only update a started machine, and preview machines suspend
      await startMachines(flyApp);
      await fly.secrets.deploy(flyApp);
      s.stop(`${flyApp} restarted with the new key`);
    } catch (error) {
      s.stop(`${flyApp} could not be restarted`);
      log.error(error instanceof Error ? error.message : String(error));
      note(
        [
          `The secret is staged on '${flyApp}' but not applied. Its machines`,
          `keep the old key until they take it up:`,
          '',
          `  fly secrets deploy --app ${flyApp}`
        ].join('\n'),
        '⚠️  Apply incomplete'
      );
      process.exit(1);
    }
  }

  outro(
    `✅  Rotated API key for '${tenantId}' (tenant '${rotated.slug}') in ${environment}`
  );
}

// Export for use as a library
export { main as rotateTenantKeyMain };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
