// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * List the users that matter to the statistics accounts, for
 * `cdwr tenant stats-accounts`: those with a stored Umami account and those
 * who are admin of a workspace.
 *
 * Read-only. Driven by env vars so the caller controls which database is
 * targeted:
 * - `PROVISION_DATABASE_URL` - target database (required)
 *
 * The list is written to stdout as one `STATS_ACCOUNTS=` JSON line.
 */
async function list() {
  const databaseUrl = process.env['PROVISION_DATABASE_URL'];

  if (!databaseUrl) {
    console.error('Error: PROVISION_DATABASE_URL is required');
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  const { docs } = await payload.find({
    collection: 'users',
    overrideAccess: true,
    pagination: false,
    depth: 0
  });

  const users = docs.flatMap(({ id, email, statsAccount, tenants }) => {
    const roles = (tenants ?? []).flatMap(({ tenant, role }) =>
      typeof tenant === 'number' ? [{ tenantId: tenant, role }] : []
    );
    const umamiUserId = statsAccount?.umamiUserId || null;
    return umamiUserId || roles.some(({ role }) => role === 'admin')
      ? [{ id, email, umamiUserId, tenants: roles }]
      : [];
  });

  report('STATS_ACCOUNTS', JSON.stringify(users));
  process.exit(0);
}

runScript('listing', list);
