// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * Activate a pending workspace, for `cdwr tenant provision`.
 *
 * Writes only `status`, and only from `pending` to `active`: an `active`
 * workspace is reported as unchanged, any other value is reported and left alone.
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `PROVISION_DATABASE_URL` - target database (required)
 * - `STATUS_TENANT_ID` - the tenant's id (required)
 *
 * The outcome is written to stdout as one `TENANT_STATUS_SET=` JSON line.
 */
async function setTenantStatus() {
  const databaseUrl = process.env['PROVISION_DATABASE_URL'];
  const tenantId = Number(process.env['STATUS_TENANT_ID']);

  if (!databaseUrl || !Number.isInteger(tenantId)) {
    console.error(
      'Error: PROVISION_DATABASE_URL and STATUS_TENANT_ID are required'
    );
    process.exit(1);
  }

  const payload = await getScriptPayload(databaseUrl);

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    overrideAccess: true,
    disableErrors: true,
    depth: 0
  });

  if (!tenant) {
    report(
      'TENANT_STATUS_SET',
      JSON.stringify({
        outcome: 'error',
        message: `Tenant ${tenantId} not found`
      })
    );
    process.exit(0);
  }

  if (tenant.status === 'active') {
    report('TENANT_STATUS_SET', JSON.stringify({ outcome: 'unchanged' }));
    process.exit(0);
  }

  if (tenant.status !== 'pending') {
    report(
      'TENANT_STATUS_SET',
      JSON.stringify({ outcome: 'conflict', current: String(tenant.status) })
    );
    process.exit(0);
  }

  await payload.update({
    collection: 'tenants',
    id: tenantId,
    data: { status: 'active' },
    overrideAccess: true
  });

  report('TENANT_STATUS_SET', JSON.stringify({ outcome: 'set' }));
  process.exit(0);
}

runScript('tenant status', setTenantStatus);
