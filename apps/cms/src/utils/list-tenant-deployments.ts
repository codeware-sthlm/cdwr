import { getScriptPayload, runScript } from './script-payload';

/**
 * List every workspace with its deployment name, for `provision-tenant`.
 *
 * Read-only. The provisioning CLI needs each workspace's API key to write it to
 * Infisical, and the key can only be read back through Payload, which decrypts
 * it with the target environment's secret.
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `PROVISION_DATABASE_URL` - target database (required)
 *
 * The list is written to stdout as one `TENANT_DEPLOYMENTS=` JSON line for the
 * caller. Nothing else prints the keys.
 */
async function list() {
  const databaseUrl = process.env['PROVISION_DATABASE_URL'];

  if (!databaseUrl) {
    console.error('Error: PROVISION_DATABASE_URL is required');
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  const { docs } = await payload.find({
    collection: 'tenants',
    overrideAccess: true,
    pagination: false,
    depth: 0
  });

  const tenants = docs.map(({ id, name, slug, deployment, apiKey }) => ({
    id,
    name,
    slug,
    deployment: deployment ?? null,
    apiKey: apiKey ?? null
  }));

  console.log(`TENANT_DEPLOYMENTS=${JSON.stringify(tenants)}`);
  process.exit(0);
}

runScript('listing', list);
