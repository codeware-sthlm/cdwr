import { z } from 'zod';

import { redactReported, reported, runCmsScript } from './database';
import type { Environment } from './infisical';

/** A user with a stored Umami account or an admin role, as the listing script reports it */
export const accountUserSchema = z.object({
  id: z.number(),
  email: z.string(),
  umamiUserId: z.string().nullable(),
  tenants: z.array(
    z.object({ tenantId: z.number(), role: z.string().nullable().optional() })
  )
});

export type AccountUser = z.infer<typeof accountUserSchema>;

/** Read the users that matter to the statistics accounts from Payload */
export async function listAccountUsers(
  root: string,
  environment: Environment,
  databaseUrl: string
): Promise<AccountUser[]> {
  const { stdout, stderr } = await runCmsScript(
    root,
    'list-stats-accounts.ts',
    environment,
    { PROVISION_DATABASE_URL: databaseUrl },
    { reports: 'STATS_ACCOUNTS' }
  );
  const json = reported(stdout, 'STATS_ACCOUNTS');
  if (!json) {
    throw new Error(
      [
        'Listing script did not report a result.',
        '',
        '--- stdout ---',
        redactReported(stdout, 'STATS_ACCOUNTS').trim() || '<empty>',
        '',
        '--- stderr ---',
        stderr.trim() || '<empty>'
      ].join('\n')
    );
  }
  return z.array(accountUserSchema).parse(JSON.parse(json));
}
