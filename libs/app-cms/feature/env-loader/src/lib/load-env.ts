import { type Env, EnvSchema } from '@codeware/app-cms/util/env-schema';
import {
  type Secret,
  isNotFound,
  withInfisical
} from '@codeware/shared/feature/infisical';

import {
  TURNSTILE_KEYS,
  type TurnstileKey,
  type TurnstilePair,
  type TurnstileSource,
  resolveTurnstilePair
} from './resolve-turnstile-pair';

const isTurnstileKey = (key: string): key is TurnstileKey =>
  (TURNSTILE_KEYS as ReadonlyArray<string>).includes(key);

/** The Turnstile keys among the secrets a folder returned, null when it failed. */
const turnstileKeys = (
  secrets: Array<Secret> | null
): TurnstileSource['keys'] =>
  secrets &&
  Object.fromEntries(
    secrets
      .filter(({ secretKey }) => isTurnstileKey(secretKey))
      .map(({ secretKey, secretValue }) => [secretKey, secretValue])
  );

/**
 * Read one folder without injecting it. A folder that doesn't exist sets
 * nothing; any other failure is null, so it isn't mistaken for an empty one.
 */
const readFolder = async (path: string): Promise<Array<Secret> | null> => {
  try {
    return await withInfisical({
      environment: process.env['DEPLOY_ENV'],
      filter: { path, recurse: false }
    });
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    console.warn(`[ENV] Could not read ${path}`);
    return null;
  }
};

/**
 * Put the resolved pair in `process.env`, replacing whatever the folders
 * injected one key at a time, and name its source for the boot warning.
 */
const applyTurnstilePair = (pair: TurnstilePair) => {
  for (const key of TURNSTILE_KEYS) {
    if (pair[key]) {
      process.env[key] = pair[key];
    } else {
      delete process.env[key];
    }
  }
  if (pair.source) {
    process.env['HUMAN_CHECK_SOURCE'] = pair.source;
  } else {
    delete process.env['HUMAN_CHECK_SOURCE'];
  }
};

/** Where the pair came from, never its values. */
const logTurnstilePair = ({ source, unreadable }: TurnstilePair) =>
  console.log(
    source
      ? `[ENV] Turnstile pair from ${source}`
      : unreadable
        ? `[ENV] Turnstile pair not set, ${unreadable} could not be read`
        : '[ENV] Turnstile pair not set'
  );

/**
 * Load and validate environment variables.
 *
 * When expected data isn't available locally, the function will connect to Infisical
 * and load the secrets into `process.env`.
 *
 * The Turnstile pair is resolved as one unit, highest first:
 * `/tenants/<tenant>/apps/cms`, `/tenants/<tenant>`, `/apps/cms`, then what was
 * set before Infisical. The first that sets either key owns the pair. Keys are
 * read only at boot, so a new pair needs a restart: a suspended machine resumes
 * from a snapshot with the old keys.
 *
 * @returns The parsed environment variables or `undefined` if the data is insufficient or invalid.
 */
export const loadEnv = async (): Promise<Env | undefined> => {
  // Deploy metadata in /apps/cms, not configuration for the running app
  delete process.env['DEPLOY_ENABLED'];

  // What was set before Infisical, the lowest source of the Turnstile pair.
  // A pair an earlier load in this process resolved keeps its folder's name
  const environment: TurnstileSource = {
    source: process.env['HUMAN_CHECK_SOURCE'] || 'the environment',
    keys: Object.fromEntries(
      TURNSTILE_KEYS.map((key) => [key, process.env[key]])
    )
  };
  const environmentPair = resolveTurnstilePair([environment]);
  applyTurnstilePair(environmentPair);

  // Pre-check environment variables as they can be injected from CLI.
  // Then there is no reason to connect to Infisical using the SDK.
  const preResponse = EnvSchema.safeParse(process.env);
  if (preResponse.success) {
    console.log(
      '[ENV] Environment variables already loaded, skipping Infisical connection'
    );
    logTurnstilePair(environmentPair);
    return preResponse.data;
  }

  // Load secrets for the cms app
  const cmsSecrets = await withInfisical({
    environment: process.env['DEPLOY_ENV'],
    filter: { path: '/apps/cms', recurse: true },
    injectEnv: true,
    silent: true
  });
  if (!cmsSecrets) {
    console.warn(
      '[ENV] Could not load cms secrets from Infisical',
      preResponse.error.flatten().fieldErrors
    );
    return;
  }

  // Highest precedence first
  const turnstileSources: Array<TurnstileSource> = [];

  // If TENANT_ID is set (tenant deployment), load tenant-specific secrets
  if (process.env['TENANT_ID']) {
    const tenantId = process.env['TENANT_ID'];
    console.log(`[ENV] Loading tenant secrets for tenant: ${tenantId}`);

    const tenantAppPath = `/tenants/${tenantId}/apps/cms`;
    const [tenantSecrets, tenantAppSecrets] = await Promise.all([
      // Shallow load to prevent loading secrets from apps folder
      withInfisical({
        environment: process.env['DEPLOY_ENV'],
        filter: { path: `/tenants/${tenantId}`, recurse: false },
        injectEnv: true,
        silent: true
      }),
      // Read for the Turnstile pair only. The deploy pushes this folder as Fly
      // secrets, which the shared folder above has already overwritten
      readFolder(tenantAppPath)
    ]);

    if (!tenantSecrets) {
      console.warn(`[ENV] Could not load tenant secrets for: ${tenantId}`);
    }

    turnstileSources.push(
      { source: tenantAppPath, keys: turnstileKeys(tenantAppSecrets) },
      { source: `/tenants/${tenantId}`, keys: turnstileKeys(tenantSecrets) }
    );
  }

  turnstileSources.push(
    { source: '/apps/cms', keys: turnstileKeys(cmsSecrets) },
    environment
  );
  const turnstilePair = resolveTurnstilePair(turnstileSources);
  applyTurnstilePair(turnstilePair);
  logTurnstilePair(turnstilePair);

  // Load CORS urls for the tenants
  const corsSecrets = await withInfisical({
    environment: process.env['DEPLOY_ENV'],
    filter: { path: '/tenants', recurse: true, tags: ['cors'] },
    silent: true
  });
  // Inject CORS urls into process.env manually
  if (corsSecrets) {
    const cors = corsSecrets
      .map((secret) => secret.secretValue.trim())
      .filter(Boolean)
      .join(',');
    process.env['CORS_URLS'] = cors;
  } else {
    console.warn('[ENV] Could not load tenant CORS secrets from Infisical');
  }

  // MAINTENANCE_MODE is controlled exclusively by the deployment action via Fly secrets.
  // Deleting it here prevents an accidental Infisical entry from locking the app in
  // maintenance mode permanently — the Fly secret is always transient.
  delete process.env['MAINTENANCE_MODE'];

  // Validate loaded environment variables
  const { success, error, data } = EnvSchema.safeParse(process.env);

  if (!success) {
    console.error('[ENV] Invalid environment variables:');
    console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
    return;
  }

  return data;
};
