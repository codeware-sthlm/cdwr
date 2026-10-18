import { z } from 'zod';

import { reported, runCmsScript, withDatabase } from './database';
import type { Environment } from './infisical';
import {
  type TeamStep,
  type TenantTeamInput,
  type TenantTeamPlan,
  teamName
} from './stats-team.logic';
import {
  type UmamiConnection,
  addTeamUser,
  createTeam,
  getWebsite,
  listTeamUsers,
  transferWebsite,
  whoAmI
} from './umami';

/** Throws unless the key belongs to an admin, which moving a website needs */
export async function requireAdmin(conn: UmamiConnection): Promise<void> {
  const me = await whoAmI(conn);
  if (me.role !== 'admin')
    throw new Error(
      `The Umami provisioning key belongs to "${me.username}" (${me.role}); moving websites needs an admin key. Create an admin user in Umami and put its API key in /integrations/umami as PROVISION_API_KEY.`
    );
}

/** Reads the planner's input: the website, the reader and the team's members */
export async function gatherTenantTeam(
  conn: UmamiConnection,
  readerConn: UmamiConnection,
  tenant: {
    statsWebsiteId: string | null;
    statsTeamId?: string | null;
  }
): Promise<TenantTeamInput> {
  const statsTeamId = tenant.statsTeamId || null;
  const [website, reader, members] = await Promise.all([
    tenant.statsWebsiteId ? getWebsite(conn, tenant.statsWebsiteId) : null,
    whoAmI(readerConn),
    statsTeamId ? listTeamUsers(conn, statsTeamId) : []
  ]);
  return {
    ...(statsTeamId && members === null ? { teamMissing: true } : {}),
    statsTeamId,
    website: website && { id: website.id, teamId: website.teamId },
    reader: { id: reader.id, role: reader.role },
    teamUserIds: (members ?? []).map(({ userId }) => userId)
  };
}

/**
 * Does the planned steps in order. The team id is handed to `writeTeamId` the
 * moment the team exists, so it is stored before anything else can fail.
 */
export async function applyTenantTeam(
  conn: UmamiConnection,
  tenant: { deployment: string },
  plan: TenantTeamPlan,
  input: TenantTeamInput,
  writeTeamId: (teamId: string) => Promise<void>
): Promise<{ teamId: string | null; done: TeamStep[] }> {
  let teamId = input.statsTeamId;
  const done: TeamStep[] = [];

  if (plan.steps.includes('create-team')) {
    teamId = (await createTeam(conn, teamName(tenant.deployment))).id;
    await writeTeamId(teamId);
    done.push('create-team');
  }
  if (!teamId) return { teamId, done };

  if (plan.steps.includes('add-reader')) {
    await addTeamUser(conn, teamId, input.reader.id, 'team-view-only');
    done.push('add-reader');
  }
  if (plan.steps.includes('move-website') && input.website) {
    await transferWebsite(conn, input.website.id, teamId);
    done.push('move-website');
  }
  return { teamId, done };
}

/** What the write-back script reports for the team id */
const teamReportSchema = z.object({
  team: z.enum(['set', 'unchanged', 'conflict']).optional(),
  currentTeam: z.string().optional()
});

/** Stores the team id on the workspace; a different recorded team is an error */
export async function recordTeamId(
  root: string,
  environment: Environment,
  databaseUrl: string,
  tenantId: number,
  teamId: string
): Promise<void> {
  const { stdout } = await withDatabase(databaseUrl, (url) =>
    runCmsScript(
      root,
      'set-tenant-stats-website.ts',
      environment,
      {
        PROVISION_DATABASE_URL: url,
        STATS_TENANT_ID: String(tenantId),
        STATS_TEAM_ID: teamId
      },
      // Safe to repeat: a second run finds the same id and reports `unchanged`
      { reports: 'STATS_WEBSITE_SET' }
    )
  );
  const json = reported(stdout, 'STATS_WEBSITE_SET');
  if (!json) throw new Error('The write-back script reported no result');
  const result = teamReportSchema.parse(JSON.parse(json));
  if (result.team === 'conflict')
    throw new Error(
      `The workspace already holds team ${result.currentTeam}, so ${teamId} was not written`
    );
}
