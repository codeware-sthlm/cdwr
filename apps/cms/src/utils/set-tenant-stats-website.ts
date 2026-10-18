// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * Set a tenant's Umami website id, share slug and team id, for `cdwr tenant provision`.
 *
 * Writes only `statsWebsiteId`, `statsShareId` and `statsTeamId`, and each only while its
 * field is empty or already holds the same value: a different value is
 * reported as a conflict and left alone.
 *
 * Driven by env vars so the caller controls which database is targeted:
 * - `PROVISION_DATABASE_URL` - target database (required)
 * - `STATS_TENANT_ID` - the tenant's id (required)
 * - `STATS_WEBSITE_ID` - the website id to set (required)
 * - `STATS_SHARE_ID` - the share slug to set (optional)
 * - `STATS_TEAM_ID` - the team id to set (optional)
 *
 * The outcome is written to stdout as one `STATS_WEBSITE_SET=` JSON line:
 * `outcome` is the website id's result, `share` the slug's and `team` the team id's when one was given.
 */
async function setStatsWebsite() {
  const databaseUrl = process.env['PROVISION_DATABASE_URL'];
  const tenantId = Number(process.env['STATS_TENANT_ID']);
  const websiteId = process.env['STATS_WEBSITE_ID'];
  const shareId = process.env['STATS_SHARE_ID'] || undefined;
  const teamId = process.env['STATS_TEAM_ID'] || undefined;

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
  const currentShare = tenant.statsShareId || undefined;
  const currentTeam = tenant.statsTeamId || undefined;

  const outcomeOf = (
    present: string | undefined,
    wanted: string
  ): 'set' | 'unchanged' | 'conflict' =>
    present === wanted ? 'unchanged' : present ? 'conflict' : 'set';

  const outcome = outcomeOf(current, websiteId);
  const share = shareId ? outcomeOf(currentShare, shareId) : undefined;
  const team = teamId ? outcomeOf(currentTeam, teamId) : undefined;

  // A conflict on any field leaves all alone: share and team belong to the website
  const conflict = [outcome, share, team].includes('conflict');
  if (!conflict && [outcome, share, team].includes('set')) {
    await payload.update({
      collection: 'tenants',
      id: tenantId,
      data: {
        ...(outcome === 'set' ? { statsWebsiteId: websiteId } : {}),
        ...(share === 'set' ? { statsShareId: shareId } : {}),
        ...(team === 'set' ? { statsTeamId: teamId } : {})
      },
      overrideAccess: true
    });
  }

  report(
    'STATS_WEBSITE_SET',
    JSON.stringify({
      outcome,
      ...(outcome === 'conflict' ? { current } : {}),
      ...(share ? { share } : {}),
      ...(share === 'conflict' ? { currentShare } : {}),
      ...(team ? { team } : {}),
      ...(team === 'conflict' ? { currentTeam } : {})
    })
  );
  process.exit(0);
}

runScript('stats website', setStatsWebsite);
