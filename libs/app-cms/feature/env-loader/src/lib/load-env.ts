import { type Env, EnvSchema } from '@codeware/app-cms/util/env-schema';
import { withInfisical } from '@codeware/shared/feature/infisical';

/**
 * Load and validate environment variables.
 *
 * When expected data isn't available locally, the function will connect to Infisical
 * and load the secrets into `process.env`.
 *
 * @returns The parsed environment variables or `undefined` if the data is insufficient or invalid.
 */
export const loadEnv = async (): Promise<Env | undefined> => {
  // Deploy metadata in /apps/cms, not configuration for the running app
  delete process.env['DEPLOY_ENABLED'];

  // Pre-check environment variables as they can be injected from CLI.
  // Then there is no reason to connect to Infisical using the SDK.
  const preResponse = EnvSchema.safeParse(process.env);
  if (preResponse.success) {
    console.log(
      '[ENV] Environment variables already loaded, skipping Infisical connection'
    );
    return preResponse.data;
  }

  // Load secrets for the cms app
  if (
    !(await withInfisical({
      environment: process.env['DEPLOY_ENV'],
      filter: { path: '/apps/cms', recurse: true },
      injectEnv: true,
      silent: true
    }))
  ) {
    console.warn(
      '[ENV] Could not load cms secrets from Infisical',
      preResponse.error.flatten().fieldErrors
    );
    return;
  }

  // If TENANT_ID is set (tenant deployment), load tenant-specific secrets
  if (process.env['TENANT_ID']) {
    const tenantId = process.env['TENANT_ID'];
    console.log(`[ENV] Loading tenant secrets for tenant: ${tenantId}`);

    // Shallow load to prevent loading secrets from apps folder
    const tenantSecretsLoaded = await withInfisical({
      environment: process.env['DEPLOY_ENV'],
      filter: { path: `/tenants/${tenantId}`, recurse: false },
      injectEnv: true,
      silent: true
    });

    if (!tenantSecretsLoaded) {
      console.warn(`[ENV] Could not load tenant secrets for: ${tenantId}`);
    }
  }

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
