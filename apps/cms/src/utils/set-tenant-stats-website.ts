// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * Set a tenant's Umami website id, for `cdwr tenant provision`.
 *
 * Writes only `statsWebsiteId`, and only while the field is empty or already
 * holds the same id: a different id is reported as a conflict and left alone.
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `PROVISION_DATABASE_URL` - target database (required)
 * - `STATS_TENANT_ID` - the tenant's id (required)
 * - `STATS_WEBSITE_ID` - the website id to set (required)
 *
 * The outcome is written to stdout as one `STATS_WEBSITE_SET=` JSON line.
 */
async function setStatsWebsite() {
  const databaseUrl = process.env['PROVISION_DATABASE_URL'];
  const tenantId = Number(process.env['STATS_TENANT_ID']);
  const websiteId = process.env['STATS_WEBSITE_ID'];

  if (!databaseUrl || !Number.isInteger(tenantId) || !websiteId) {
    console.error(
      'Error: PROVISION_DATABASE_URL, STATS_TENANT_ID and STATS_WEBSITE_ID are required'
    );
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    overrideAccess: true,
    depth: 0
  });

  const current = tenant.statsWebsiteId || undefined;

  if (current === websiteId) {
    report('STATS_WEBSITE_SET', JSON.stringify({ outcome: 'unchanged' }));
    process.exit(0);
  }

  if (current) {
    report(
      'STATS_WEBSITE_SET',
      JSON.stringify({ outcome: 'conflict', current })
    );
    process.exit(0);
  }

  await payload.update({
    collection: 'tenants',
    id: tenantId,
    data: { statsWebsiteId: websiteId },
    overrideAccess: true
  });

  report('STATS_WEBSITE_SET', JSON.stringify({ outcome: 'set' }));
  process.exit(0);
}

runScript('stats website', setStatsWebsite);
