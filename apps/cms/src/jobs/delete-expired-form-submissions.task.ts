import {
  deleteFormSubmissions,
  getSiteSettingsForAllTenants
} from '@codeware/app-cms/data-access';
import type { BasePayload, TaskConfig } from 'payload';

/**
 * Delete form submissions older than their workspace allows.
 *
 * Deleted rather than anonymised, unlike tour signups: a signup keeps party
 * sizes that describe how a tour ran, but a submission is nothing except what
 * a visitor wrote, so there is nothing left worth keeping once that goes.
 *
 * Retention is set per workspace, and a workspace without a period is left
 * alone — its submissions are kept until someone deletes them.
 *
 * @returns Number of submissions deleted across all workspaces
 */
export async function sweepExpiredSubmissions(
  payload: BasePayload
): Promise<number> {
  const settings = await getSiteSettingsForAllTenants(payload);

  let deleted = 0;

  for (const doc of settings) {
    const retentionDays = doc.forms?.retentionDays;
    const tenantId =
      typeof doc.tenant === 'number' ? doc.tenant : doc.tenant?.id;

    if (!retentionDays || !tenantId) {
      continue;
    }

    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { docs, errors } = await deleteFormSubmissions(payload, {
      and: [
        { tenant: { equals: tenantId } },
        { createdAt: { less_than: cutoff } }
      ]
    });

    deleted += docs.length;

    if (errors.length) {
      payload.logger.error(
        `[deleteExpiredFormSubmissions] ${errors.length} submissions for tenant ${tenantId} could not be deleted`
      );
    }
  }

  return deleted;
}

/**
 * Nightly retention sweep over form submissions.
 *
 * Only workspaces that have set a retention period are swept. Runs through the
 * same nightly queue as the tour signup sweep, whose locking keeps a second
 * Fly machine from doing the same work twice.
 */
export const deleteExpiredFormSubmissionsTask: TaskConfig<{
  input: Record<string, never>;
  output: { deleted: number };
}> = {
  slug: 'delete-expired-form-submissions',
  label: 'Delete form submissions past retention',
  schedule: [{ cron: '0 3 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    const deleted = await sweepExpiredSubmissions(req.payload);

    if (deleted) {
      req.payload.logger.info(
        `[deleteExpiredFormSubmissions] Deleted ${deleted} submissions past retention`
      );
    }

    return { output: { deleted } };
  }
};
