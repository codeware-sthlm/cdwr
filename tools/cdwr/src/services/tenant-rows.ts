import { z } from 'zod';

import {
  type TenantRow,
  tenantRowSchema
} from '../commands/tenant/provision.logic';

import { redactReported, reported, runCmsScript } from './database';
import type { Environment } from './infisical';

/** Read every workspace with its deployment name and key from Payload */
export async function listTenantRows(
  root: string,
  environment: Environment,
  databaseUrl: string
): Promise<TenantRow[]> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'list-tenant-deployments.ts',
    environment,
    { PROVISION_DATABASE_URL: databaseUrl },
    { reports: 'TENANT_DEPLOYMENTS' }
  );
  const json = reported(stdout, 'TENANT_DEPLOYMENTS');
  if (!json) {
    throw new Error(
      [
        'Listing script did not report a result.',
        '',
        '--- stdout ---',
        redactReported(stdout, 'TENANT_DEPLOYMENTS').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
  return z.array(tenantRowSchema).parse(JSON.parse(json));
}
