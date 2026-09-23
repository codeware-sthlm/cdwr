// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { randomUUID } from 'crypto';

import { getScriptPayload, runScript } from './script-payload';

/**
 * Rotate a tenant's Payload API key using the local-api.
 *
 * The `apiKey` field is write-protected for REST, GraphQL and the admin UI
 * (`update: () => false`), which the local-api bypasses with `overrideAccess`.
 * That is why rotation runs as a script rather than from the admin panel.
 *
 * The tenant is identified by its **current API key**, not by a slug. Infisical
 * tenant ids and Payload tenant slugs are separate namespaces - `/tenants/demo`
 * can hold the key of a tenant slugged `star-wars` - and the key is what a
 * deployment itself authenticates with (see `resolveScopedTenant`).
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `ROTATE_CURRENT_API_KEY` - the key currently in Infisical (required)
 * - `ROTATE_DATABASE_URL` - target database, overriding whatever Infisical
 *   resolves (required - the caller reaches the database differently than a
 *   deployment does, through a pooler or a Fly proxy)
 * - `ROTATE_DRY_RUN` - resolve and report the tenant without writing anything
 * - `ROTATE_NEW_API_KEY` - the key to set, instead of generating one. Lets a
 *   rotation be undone by putting back the key the rest of the system still has
 *
 * The resolved tenant and new key are written to stdout as `RESOLVED_TENANT=`
 * and `ROTATED_API_KEY=` for the caller. Nothing else prints the key.
 */
async function rotate() {
  const currentApiKey = process.env['ROTATE_CURRENT_API_KEY'];
  const databaseUrl = process.env['ROTATE_DATABASE_URL'];

  if (!currentApiKey || !databaseUrl) {
    console.error(
      'Error: ROTATE_CURRENT_API_KEY and ROTATE_DATABASE_URL are required'
    );
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  // The key is hashed in the DB index and cannot be matched with a where
  // clause, so resolve it the same way access control does - read them all and
  // compare in memory.
  const { docs } = await payload.find({
    collection: 'tenants',
    overrideAccess: true,
    pagination: false,
    depth: 0
  });

  const tenant = docs.find(({ apiKey }) => apiKey === currentApiKey);

  if (!tenant) {
    console.error(
      'Error: No tenant in this database uses the API key held in Infisical.\n' +
        'Either the two have drifted apart, or this is the wrong environment.'
    );
    process.exit(1);
  }

  // Resolving is the risky part to get wrong, so it can be checked on its own
  if (process.env['ROTATE_DRY_RUN'] === 'true') {
    console.log(
      `[ROTATE] Would rotate tenant '${tenant.slug}' (id: ${tenant.id})`
    );
    console.log(`RESOLVED_TENANT=${tenant.slug}`);
    process.exit(0);
  }

  const apiKey = process.env['ROTATE_NEW_API_KEY'] || randomUUID();

  await payload.update({
    collection: 'tenants',
    id: tenant.id,
    data: { apiKey, enableAPIKey: true },
    overrideAccess: true
  });

  console.log(`[ROTATE] Tenant '${tenant.slug}' (id: ${tenant.id}) updated`);
  console.log(`RESOLVED_TENANT=${tenant.slug}`);
  console.log(`ROTATED_API_KEY=${apiKey}`);

  process.exit(0);
}

runScript('rotation', rotate);
